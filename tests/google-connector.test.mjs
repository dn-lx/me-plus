import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {ingestionCutoff,acceptsObservation,calendarWindow} from '../supabase/functions/_shared/ingestion-window.ts';

async function edge(name,valid=true,options={}){
 let handler;const updates=[];const proofs=[];let lookups=0;
 const metadata={folders:[{id:'synthetic-folder'}],ingestFrom:'2026-10-16T00:00:00Z'};
 const db={rpc:async(name,args)=>{if(name==='server_record_meplus_integration_probe'){proofs.push(args);return {data:options.recorded??true,error:null};}return {data:valid,error:null};},from:()=>({
  select:()=>({eq:async()=>{lookups++;return {data:[{id:'synthetic-source',metadata}],error:null};}}),
  update:values=>({eq:async()=>{updates.push(values);return {error:null};}})
 })};
 let source=await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
 source=source.replace(/^import .*;\s*$/gm,'');
 const context=vm.createContext({Request,Response,URL,URLSearchParams,TextEncoder,crypto:webcrypto,
  ingestionCutoff,acceptsObservation,calendarWindow,createClient:()=>db,
  fetch:async()=>Response.json({access_token:'synthetic-oauth-token-never-expose'}),
  Deno:{env:{get:key=>key.startsWith('SUPABASE_')?'synthetic-runtime':options.oauthAuthorized&&key.startsWith('GOOGLE_')?'synthetic-google-credential':undefined},serve:f=>{handler=f;}}});
 vm.runInContext(stripTypeScriptTypes(source),context);
 if(name==='me-plus-healthsync-drive')vm.runInContext('globalThis.parseReadings=readingsFromCsv',context);
 return {handler,updates,metadata,context,proofs,lookups:()=>lookups};
}
test('Health Sync authorization failure preserves saved folders and ingestion cutoff',async()=>{
 const f=await edge('me-plus-healthsync-drive');
 const r=await f.handler(new Request('https://example.invalid',{method:'POST',body:'{}'}));
 assert.equal(r.status,502);assert.equal(f.updates.length,1);
 assert.equal(f.updates[0].metadata.ingestFrom,f.metadata.ingestFrom);
 assert.equal(f.updates[0].metadata.folders,f.metadata.folders);
 assert.equal(f.updates[0].metadata.authConfigured,false);
});
test('Google callbacks record only nonce-bound server proofs after wake validation',async()=>{
 const probe_id='00000000-0000-0000-0000-000000000001';
 for(const name of ['me-plus-healthsync-drive','meplus-google-calendar-sync']){
  for(const oauthAuthorized of [true,false]){
   const f=await edge(name,true,{oauthAuthorized});
   const r=await f.handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({mode:'auth_probe',probe_id})}));
   assert.equal(r.status,oauthAuthorized?200:502);assert.equal(f.proofs.length,1);
   assert.equal(f.proofs[0].p_probe_id,probe_id);assert.equal(f.proofs[0].p_authorized,oauthAuthorized);
   assert.equal(f.proofs[0].p_provider,name==='me-plus-healthsync-drive'?'google-drive-healthsync':'google-calendar-supabase');
   assert.ok(!(await r.text()).includes('synthetic-oauth-token'));assert.equal(f.updates.length,0);
  }
  const denied=await edge(name,false);
  assert.equal((await denied.handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({mode:'auth_probe',probe_id})}))).status,401);assert.equal(denied.proofs.length,0);
  const rejected=await edge(name,true,{recorded:false});
  assert.equal((await rejected.handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({mode:'auth_probe',probe_id})}))).status,409);
 }
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
