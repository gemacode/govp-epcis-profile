import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { attachGovpReference, toGovpEpcisReference } from '../dist/index.js';

const schema=JSON.parse(await readFile(new URL('../schemas/govp-epcis-reference.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:true});addFormats(ajv);
const validate=ajv.compile(schema);

const gs1Url='https://ref.gs1.org/standards/epcis/2.0.0/epcis-json-schema.json';
const gs1Sha256='cfabd8620cc4dd67a53e6aa397bc26379f8b05bb9147c8a37a60bbec69a62572';
const response=await fetch(gs1Url);
if(!response.ok)throw new Error(`No se pudo recuperar el esquema normativo GS1 EPCIS 2.0.0: ${response.status}`);
const gs1Text=await response.text();
const digest=createHash('sha256').update(gs1Text).digest('hex');
if(digest!==gs1Sha256)throw new Error(`La huella del esquema GS1 ha cambiado: ${digest}`);
const gs1Schema=JSON.parse(gs1Text);
const gs1Ajv=new Ajv({strict:false,allErrors:true});addFormats(gs1Ajv);gs1Ajv.addSchema(gs1Schema);

const vectorDirectory=new URL('../vectors/',import.meta.url);
const names=(await readdir(vectorDirectory)).filter((name)=>name.endsWith('.jsonld')).sort();
const covered=new Set();
for(const name of names){
  const event=JSON.parse(await readFile(new URL(name,vectorDirectory),'utf8'));
  const validateEvent=gs1Ajv.compile({$ref:`${gs1Url}#/definitions/${event.type}`});
  if(!validateEvent(event))throw new Error(`${name}: ${gs1Ajv.errorsText(validateEvent.errors)}`);
  const reference=toGovpEpcisReference(event,`https://epcis.example/events/${encodeURIComponent(event.eventID)}`);
  if(!validate(reference))throw new Error(`${name}: ${ajv.errorsText(validate.errors)}`);
  const linked=attachGovpReference(event,{...reference,govpCode:`GOVP-${event.type}`,govpVerifyUrl:`https://partners.gemacode.org/exchange/comprobar/GOVP-${event.type}`});
  if(!validateEvent(linked))throw new Error(`${name} enlazado: ${gs1Ajv.errorsText(validateEvent.errors)}`);
  covered.add(event.type);
  console.log(`PASS ${event.type}: ${reference.eventDigest}`);
}
const expected=['AggregationEvent','AssociationEvent','ObjectEvent','TransactionEvent','TransformationEvent'];
if(expected.some((type)=>!covered.has(type)))throw new Error(`Cobertura incompleta: ${[...covered].join(', ')}`);
console.log(`GOVP EPCIS vectors passed against pinned GS1 schema: ${names.length}`);
