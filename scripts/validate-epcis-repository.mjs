import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { attachGovpReference, extractGovpReference, toGovpEpcisReference } from '../dist/index.js';

const baseUrl=(process.env.EPCIS_REPOSITORY_URL??'https://fastnt-dev.azurewebsites.net').replace(/\/$/,'');
const capturePath=process.env.EPCIS_CAPTURE_PATH??'/Capture';
const credentials=process.env.EPCIS_BASIC_AUTH;
if(!credentials?.includes(':'))throw new Error('EPCIS_BASIC_AUTH debe contener usuario:contraseña para aislar la prueba.');
const authorization=`Basic ${Buffer.from(credentials).toString('base64')}`;
const headers={accept:'application/json','content-type':'application/json',authorization};

async function request(path,options={}){
  const response=await fetch(`${baseUrl}${path}`,{...options,headers:{...headers,...options.headers}});
  const text=await response.text();
  let body;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!response.ok)throw new Error(`${options.method??'GET'} ${path}: ${response.status} ${text.slice(0,1000)}`);
  return {response,body};
}

const vectorDirectory=new URL('../vectors/',import.meta.url);
const names=(await readdir(vectorDirectory)).filter((name)=>name.endsWith('.jsonld')).sort();
const linkedEvents=[];
for(const name of names){
  const event=JSON.parse(await readFile(new URL(name,vectorDirectory),'utf8'));
  event.eventID=`urn:uuid:${randomUUID()}`;
  const eventUrl=`${baseUrl}/events/${encodeURIComponent(event.eventID)}`;
  const reference=toGovpEpcisReference(event,eventUrl);
  linkedEvents.push(attachGovpReference(event,{...reference,govpCode:`GOVP-NATIVE-${event.type}`,govpVerifyUrl:`https://partners.gemacode.org/exchange/comprobar/GOVP-NATIVE-${event.type}`}));
}

await request(capturePath,{
  method:'POST',
  headers:{'content-type':'application/json','GS1-Capture-Error-Behaviour':'rollback'},
  body:JSON.stringify({
    '@context':['https://ref.gs1.org/standards/epcis/epcis-context.jsonld','https://downloads.govp.io/contexts/epcis/0.1/govp-epcis-context.jsonld'],
    type:'EPCISDocument',
    schemaVersion:'2.0',
    creationDate:new Date().toISOString(),
    epcisBody:{eventList:linkedEvents},
  }),
});

for(const expected of linkedEvents){
  const result=await request(`/events/${encodeURIComponent(expected.eventID)}`);
  const events=result.body?.epcisBody?.queryResults?.resultsBody?.eventList ?? result.body?.epcisBody?.eventList ?? (Array.isArray(result.body)?result.body:[]);
  const found=events.find((event)=>event.eventID===expected.eventID);
  if(!found)throw new Error(`El repositorio EPCIS no devolvió ${expected.eventID}`);
  if(!found['@context']&&result.body?.['@context'])found['@context']=result.body['@context'];
  let actual;
  try{actual=extractGovpReference(found);}
  catch(error){throw new Error(`${error.message} Claves recuperadas: ${Object.keys(found).sort().join(', ')}`);}
  const wanted=extractGovpReference(expected);
  if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(`La referencia GOVP cambió al recuperar ${expected.eventID}`);
  console.log(`PASS ${expected.type}: ${actual.eventDigest}`);
}

const foreignHeaders={...headers,authorization:`Basic ${Buffer.from(`foreign-${randomUUID()}:foreign`).toString('base64')}`};
const protectedEvent=linkedEvents[0];
const foreign=await fetch(`${baseUrl}/events/${encodeURIComponent(protectedEvent.eventID)}`,{headers:foreignHeaders});
if(foreign.ok){
  const body=await foreign.json();
  const events=body?.epcisBody?.queryResults?.resultsBody?.eventList ?? body?.epcisBody?.eventList ?? (Array.isArray(body)?body:[]);
  if(events.some((event)=>event.eventID===protectedEvent.eventID))throw new Error('El evento fue visible con credenciales de otro propietario.');
}

console.log(`GOVP EPCIS independent capture/query and authorization passed: ${linkedEvents.length} events on ${new URL(baseUrl).host}`);
