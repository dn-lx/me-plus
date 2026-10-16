import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {ingestionCutoff,acceptsObservation,calendarWindow} from '../supabase/functions/_shared/ingestion-window.ts';

async function edge(name,valid=true){
 let handler;const updates=[];let lookups=0;
 const metadata={folders:[{id:'synthetic-folder'}],ingestFrom:'2026-10-16T00:00:00Z'};
 const db={rpc:async()=>({data:valid,error:null}),from:()=>({
  select:()=>({eq:async()=>{lookups++;return {data:[{id:'synthetic-source',metadata}],error:null};}}),
  update:values=>({eq:async()=>{updates.push(values);return {error:null};}})
 })};
 let source=await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
 source=source.replace(/^import .*;\s*$/gm,'');
 const context=vm.createContext({Request,Response,URL,URLSearchParams,TextEncoder,crypto:webcrypto,
  ingestionCutoff,acceptsObservation,calendarWindow,createClient:()=>db,
  Deno:{env:{get:key=>key.startsWith('SUPABASE_')?'synthetic-runtime':undefined},serve:f=>{handler=f;}}});
 vm.runInContext(stripTypeScriptTypes(source),context);
 if(name==='me-plus-healthsync-drive')vm.runInContext('globalThis.parseReadings=readingsFromCsv',context);
 return {handler,updates,metadata,context,lookups:()=>lookups};
}
test('Health Sync authorization failure preserves saved folders and ingestion cutoff',async()=>{
 const f=await edge('me-plus-healthsync-drive');
 const r=await f.handler(new Request('https://example.invalid',{method:'POST',body:'{}'}));
 assert.equal(r.status,502);assert.equal(f.updates.length,1);
 assert.equal(f.updates[0].metadata.ingestFrom,f.metadata.ingestFrom);
 assert.equal(f.updates[0].metadata.folders,f.metadata.folders);
 assert.equal(f.updates[0].metadata.authConfigured,false);
});
test('Google auth probes are wake-authenticated and never ingest or rewrite source state',async()=>{
 for(const name of ['me-plus-healthsync-drive','meplus-google-calendar-sync']){
  for(const allowed of [true,false]){
   const f=await edge(name,allowed);
   const r=await f.handler(new Request('https://example.invalid',{method:'POST',body:'{"mode":"auth_probe"}'}));
   assert.equal(r.status,allowed?502:401);assert.equal(f.updates.length,0);assert.equal(f.lookups(),0);
   const body=await r.text();assert.ok(!body.includes('synthetic-runtime'));
  }
 }
});
test('actual Health Sync parser reconciles only observations at or after the source cutoff',async()=>{
 const f=await edge('me-plus-healthsync-drive');
 const csv='Date,Time,Steps\n2026-10-15,12:00:00,50\n2026-10-16,12:00:00,70\n';
 const parsed=await f.context.parseReadings({key:'steps',id:'synthetic',name:'Steps'},
  {id:'file',name:'steps.csv',modifiedTime:'2026-10-16T12:00:00Z'},csv,0,0,Date.parse('2026-10-16T00:00:00Z'));
 assert.equal(parsed.readings.length,1);assert.equal(parsed.readings[0].valueNumber,70);
 assert.equal(parsed.readings[0].observedAt,'2026-10-16T10:00:00.000Z');
});
