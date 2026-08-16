import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import { toGovpEpcisReference } from '../dist/index.js';

const schema=JSON.parse(await readFile(new URL('../schemas/govp-epcis-reference.schema.json',import.meta.url),'utf8'));
const event=JSON.parse(await readFile(new URL('../vectors/object-event-shipping.jsonld',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:true});addFormats(ajv);
const validate=ajv.compile(schema);
const reference=toGovpEpcisReference(event,'https://epcis.example/events/12345678');
if(!validate(reference))throw new Error(ajv.errorsText(validate.errors));
console.log(`GOVP EPCIS vector passed: ${reference.eventDigest}`);
