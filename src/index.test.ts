import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { attachGovpReference, epcisEventDigest, extractGovpReference, toGovpEpcisReference, toGovpIssuance, type EpcisEvent } from './index.js';

const event=JSON.parse(readFileSync(new URL('../vectors/object-event-shipping.jsonld',import.meta.url),'utf8')) as EpcisEvent;

describe('GOVP EPCIS 2.0 profile',()=>{
  it('normaliza listas EPC sin depender de su orden',()=>{
    const reversed=structuredClone(event);reversed.epcList=[...(reversed.epcList??[])].reverse();
    expect(epcisEventDigest(reversed)).toBe(epcisEventDigest(event));
    reversed.epcList?.push('urn:epc:id:sgtin:0614141.107346.9999');
    expect(epcisEventDigest(reversed)).not.toBe(epcisEventDigest(event));
  });

  it('mapea solo semántica EPCIS presente',()=>{
    const reference=toGovpEpcisReference(event,'https://epcis.example/events/12345678');
    expect(reference).toMatchObject({eventType:'ObjectEvent',action:'OBSERVE',bizStep:'https://ref.gs1.org/cbv/BizStep-shipping'});
    expect(reference.eventDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('expande valores CBV compactos en la referencia GOVP',()=>{
    const compact={...event,bizStep:'shipping',disposition:'in_transit'};
    const reference=toGovpEpcisReference(compact,'https://epcis.example/events/compact');
    expect(reference.bizStep).toBe('https://ref.gs1.org/cbv/BizStep-shipping');
    expect(reference.disposition).toBe('https://ref.gs1.org/cbv/Disp-in_transit');
  });

  it('crea una emisión GOVP por referencia y huella',()=>{
    const issuance=toGovpIssuance(event,{eventUrl:'https://epcis.example/events/12345678',issuerName:'Empresa ficticia',validUntil:'2027-08-16T00:00:00Z'});
    expect(issuance.source).toEqual({platform:'epcis',externalId:event.eventID});
    expect(issuance.evidence[0]?.url).toBe('https://epcis.example/events/12345678');
    expect(JSON.stringify(issuance)).not.toContain('0614141.00888.0');
  });

  it('añade y recupera la referencia sin alterar la huella original',()=>{
    const base=toGovpEpcisReference(event,'https://epcis.example/events/12345678');
    const linked=attachGovpReference(event,{...base,govpCode:'GOVP-123',govpVerifyUrl:'https://partners.gemacode.org/exchange/comprobar/GOVP-123'});
    const extracted=extractGovpReference(linked);
    expect(extracted).toEqual({...base,govpCode:'GOVP-123',govpVerifyUrl:'https://partners.gemacode.org/exchange/comprobar/GOVP-123'});
    expect(epcisEventDigest(linked)).toBe(base.eventDigest);
  });

  it('detecta un acontecimiento modificado después de enlazar el GOVP',()=>{
    const base=toGovpEpcisReference(event,'https://epcis.example/events/12345678');
    const linked=attachGovpReference(event,{...base,govpCode:'GOVP-123',govpVerifyUrl:'https://partners.gemacode.org/exchange/comprobar/GOVP-123'});
    const tampered={...linked,disposition:'https://ref.gs1.org/cbv/Disp-damaged'};
    expect(()=>extractGovpReference(tampered)).toThrow(/huella GOVP no corresponde/);
  });

  it('rechaza referencias cruzadas y URIs de transporte inseguras',()=>{
    const base=toGovpEpcisReference(event,'https://epcis.example/events/12345678');
    expect(()=>attachGovpReference({...event,eventID:'urn:uuid:other'},{...base,govpCode:'x',govpVerifyUrl:'https://example.com/x'})).toThrow(/no corresponde/);
    expect(()=>toGovpEpcisReference(event,'http://epcis.example/event')).toThrow(/HTTPS o URN/);
  });
});
