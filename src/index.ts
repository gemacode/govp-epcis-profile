import { createHash } from 'node:crypto';

export const GOVP_EPCIS_PROFILE_VERSION = '0.1' as const;
export const GOVP_EPCIS_CONTEXT = 'https://govp.io/contexts/epcis/0.1/govp-epcis-context.jsonld';

export type EpcisEventType = 'ObjectEvent' | 'AggregationEvent' | 'TransactionEvent' | 'TransformationEvent' | 'AssociationEvent';
export type EpcisEvent = {
  '@context'?: string | Array<string | Record<string, unknown>>;
  type: EpcisEventType;
  eventID: string;
  eventTime: string;
  action?: 'ADD' | 'OBSERVE' | 'DELETE';
  bizStep?: string;
  disposition?: string;
  readPoint?: { id?: string };
  bizLocation?: { id?: string };
  epcList?: string[];
  childEPCs?: string[];
  parentID?: string;
  inputEPCList?: string[];
  outputEPCList?: string[];
  [key: string]: unknown;
};

export type GovpEpcisReference = {
  profileVersion: typeof GOVP_EPCIS_PROFILE_VERSION;
  eventId: string;
  eventType: EpcisEventType;
  eventTime: string;
  action?: EpcisEvent['action'];
  bizStep?: string;
  disposition?: string;
  readPoint?: string;
  bizLocation?: string;
  eventDigest: string;
  eventUrl: string;
  govpCode?: string;
  govpVerifyUrl?: string;
};

const extensionKeys = new Set(['govpCode','govpVerifyUrl','govpEventDigest','govpEventUrl','govpProfileVersion']);

function originalEvent(event: EpcisEvent): Record<string, unknown> {
  const copy = structuredClone(event) as Record<string, unknown>;
  for (const key of extensionKeys) delete copy[key];
  if (Array.isArray(copy['@context'])) {
    const contexts = copy['@context'].filter((item) => item !== GOVP_EPCIS_CONTEXT);
    copy['@context'] = contexts.length === 1 ? contexts[0] : contexts;
  }
  for (const key of ['epcList','childEPCs','inputEPCList','outputEPCList']) {
    if (Array.isArray(copy[key])) copy[key] = [...copy[key] as string[]].sort();
  }
  return copy;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

function absolute(value: string, label: string) {
  const parsed = new URL(value);
  if (!['https:','urn:'].includes(parsed.protocol)) throw new TypeError(`${label} debe ser una URI HTTPS o URN.`);
  return value;
}

export function epcisEventDigest(event: EpcisEvent) {
  return createHash('sha256').update(stable(originalEvent(event))).digest('hex');
}

export function toGovpEpcisReference(event: EpcisEvent, eventUrl: string): GovpEpcisReference {
  if (!['ObjectEvent','AggregationEvent','TransactionEvent','TransformationEvent','AssociationEvent'].includes(event.type)) throw new TypeError('Tipo de evento EPCIS 2.0 no soportado.');
  absolute(event.eventID,'eventID');
  if (!Number.isFinite(Date.parse(event.eventTime))) throw new TypeError('eventTime debe ser ISO 8601.');
  absolute(eventUrl,'eventUrl');
  return {
    profileVersion: GOVP_EPCIS_PROFILE_VERSION,
    eventId: event.eventID,
    eventType: event.type,
    eventTime: new Date(event.eventTime).toISOString(),
    ...(event.action ? { action: event.action } : {}),
    ...(event.bizStep ? { bizStep: event.bizStep } : {}),
    ...(event.disposition ? { disposition: event.disposition } : {}),
    ...(event.readPoint?.id ? { readPoint: event.readPoint.id } : {}),
    ...(event.bizLocation?.id ? { bizLocation: event.bizLocation.id } : {}),
    eventDigest: epcisEventDigest(event),
    eventUrl,
  };
}

function subjectId(event: EpcisEvent) {
  return event.parentID ?? event.epcList?.[0] ?? event.outputEPCList?.[0] ?? event.inputEPCList?.[0] ?? event.childEPCs?.[0] ?? event.eventID;
}

function subjectType(event: EpcisEvent): 'product' | 'lot' | 'order' | 'shipment' {
  if (event.type === 'TransactionEvent') return 'order';
  if (event.type === 'AggregationEvent' || event.type === 'AssociationEvent') return 'shipment';
  return subjectId(event).includes(':class:') ? 'lot' : 'product';
}

export function toGovpIssuance(event: EpcisEvent, options: { eventUrl: string; issuerName: string; validUntil: string }) {
  const reference = toGovpEpcisReference(event, options.eventUrl);
  return {
    issuer: { name: options.issuerName },
    subject: { type: subjectType(event), id: subjectId(event), name: `${event.type} ${event.eventID}` },
    requirement: event.bizStep ? `Demostrar el acontecimiento EPCIS asociado al business step ${event.bizStep}.` : 'Demostrar el acontecimiento EPCIS referenciado sin atribuirle un business step ausente.',
    evidence: [{ label: 'Huella canónica del acontecimiento EPCIS 2.0', sha256: reference.eventDigest, url: reference.eventUrl }],
    validUntil: new Date(options.validUntil).toISOString(),
    source: { platform: 'epcis' as const, externalId: event.eventID },
  };
}

export function attachGovpReference(event: EpcisEvent, reference: GovpEpcisReference & { govpCode: string; govpVerifyUrl: string }): EpcisEvent {
  if (reference.eventId !== event.eventID || reference.eventDigest !== epcisEventDigest(event)) throw new TypeError('La referencia GOVP no corresponde al evento EPCIS.');
  const contexts = Array.isArray(event['@context']) ? [...event['@context']] : event['@context'] ? [event['@context']] : [];
  if (!contexts.includes(GOVP_EPCIS_CONTEXT)) contexts.push(GOVP_EPCIS_CONTEXT);
  return { ...structuredClone(event), '@context': contexts, govpCode: reference.govpCode, govpVerifyUrl: reference.govpVerifyUrl, govpEventDigest: reference.eventDigest, govpEventUrl: reference.eventUrl, govpProfileVersion: reference.profileVersion };
}

export function extractGovpReference(event: EpcisEvent): GovpEpcisReference {
  const record = event as Record<string, unknown>;
  if (record.govpProfileVersion !== GOVP_EPCIS_PROFILE_VERSION || typeof record.govpCode !== 'string' || typeof record.govpVerifyUrl !== 'string' || typeof record.govpEventDigest !== 'string' || typeof record.govpEventUrl !== 'string') throw new TypeError('El evento no contiene una referencia GOVP EPCIS completa.');
  return { ...toGovpEpcisReference(event, record.govpEventUrl), eventDigest: record.govpEventDigest, govpCode: record.govpCode, govpVerifyUrl: record.govpVerifyUrl };
}
