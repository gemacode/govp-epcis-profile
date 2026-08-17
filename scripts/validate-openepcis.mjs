import { readdir, readFile } from 'node:fs/promises';
import { attachGovpReference, extractGovpReference, toGovpEpcisReference } from '../dist/index.js';

const baseUrl=(process.env.OPEN_EPCIS_URL??'http://localhost:8080').replace(/\/$/,'');
const contextUrl='https://downloads.govp.io/contexts/epcis/0.1/govp-epcis-context.jsonld';
const namespace='https://govp.io/ns/epcis#';
const headers={accept:'application/json','content-type':'application/json'};

async function request(path,options={}){
  const response=await fetch(`${baseUrl}${path}`,{...options,headers:{...headers,...options.headers}});
  const text=await response.text();
  let body;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!response.ok)throw new Error(`${options.method??'GET'} ${path}: ${response.status} ${text.slice(0,1000)}`);
  return {response,body};
}

await request(`/userExtension/jsonSchema?namespace=${encodeURIComponent(namespace)}&defaultPrefix=govp`,{
  method:'POST',
  body:JSON.stringify({
    $schema:'http://json-schema.org/draft-07/schema#',
    title:'GOVP EPCIS reference',
    additionalProperties:true,
    properties:{
      code:{type:'string'},
      verifyUrl:{type:'string',format:'uri'},
      eventDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},
      eventUrl:{type:'string',format:'uri'},
      profileVersion:{type:'string'},
    },
  }),
});

const vectorDirectory=new URL('../vectors/',import.meta.url);
const names=(await readdir(vectorDirectory)).filter((name)=>name.endsWith('.jsonld')).sort();
const linkedEvents=[];
for(const name of names){
  const event=JSON.parse(await readFile(new URL(name,vectorDirectory),'utf8'));
  const eventUrl=`https://epcis.example/events/${encodeURIComponent(event.eventID)}`;
  const reference=toGovpEpcisReference(event,eventUrl);
  linkedEvents.push(attachGovpReference(event,{...reference,govpCode:`GOVP-NATIVE-${event.type}`,govpVerifyUrl:`https://partners.gemacode.org/exchange/comprobar/GOVP-NATIVE-${event.type}`}));
}

const capture=await request('/capture',{
  method:'POST',
  headers:{'content-type':'application/ld+json'},
  body:JSON.stringify({
    '@context':['https://ref.gs1.org/standards/epcis/epcis-context.jsonld',contextUrl],
    type:'EPCISDocument',
    schemaVersion:'2.0',
    creationDate:new Date().toISOString(),
    epcisBody:{eventList:linkedEvents},
  }),
});
const location=capture.response.headers.get('location');
if(location){
  const statusPath=new URL(location,baseUrl).pathname;
  for(let attempt=0;attempt<60;attempt++){
    const status=await request(statusPath);
    if(status.body?.running===false||status.body?.finishedAt){
      if(status.body?.success===false)throw new Error(`Captura OpenEPCIS fallida: ${JSON.stringify(status.body)}`);
      break;
    }
    if(attempt===59)throw new Error('La captura OpenEPCIS no finalizó en 60 segundos.');
    await new Promise((resolve)=>setTimeout(resolve,1000));
  }
}

for(const expected of linkedEvents){
  let found;
  for(let attempt=0;attempt<30&&!found;attempt++){
    const result=await request(`/events/${encodeURIComponent(expected.eventID)}`);
    const events=result.body?.epcisBody?.queryResults?.resultsBody?.eventList ?? result.body?.epcisBody?.eventList ?? (Array.isArray(result.body)?result.body:[]);
    found=events.find((event)=>event.eventID===expected.eventID);
    if(!found)await new Promise((resolve)=>setTimeout(resolve,1000));
  }
  if(!found)throw new Error(`OpenEPCIS no devolvió ${expected.eventID}`);
  const actual=extractGovpReference(found);
  const wanted=extractGovpReference(expected);
  if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(`La referencia GOVP cambió al recuperar ${expected.eventID}`);
  console.log(`PASS OpenEPCIS ${expected.type}: ${actual.eventDigest}`);
}

console.log(`GOVP EPCIS native capture/query passed: ${linkedEvents.length} events on ${baseUrl}`);
