import assert from 'node:assert/strict';
import test from 'node:test';
import {executeWebNote} from '../apps/web/lib/capture-note-handler.ts';
const input={id:'11111111-1111-4111-8111-111111111111',owner:'owner',content:' A note '};
function fake({owner='owner',readOwner='owner',readContent='A note',duplicate=false,error=false,changed=false}={}){let authCalls=0;const calls=[];const db={auth:{getUser:async()=>({data:{user:{id:changed&&++authCalls>1?'other':owner}},error:null})},from(table){const filters=[];return {insert:async row=>{calls.push({row,table});return {error:error?{code:'error'}:duplicate?{code:'23505'}:null};},select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){calls.push({filters});return {data:{id:input.id,user_id:readOwner,content:readContent},error:null};}};}};return {db,calls};}
test('confirmed exact note succeeds and readback filters current owner',async()=>{const {db,calls}=fake();assert.equal((await executeWebNote(db,input)).ok,true);assert.equal(calls[0].row.user_id,'owner');assert.equal(calls[0].row.channel,'me-plus-web');assert.deepEqual(calls[1].filters,[['id',input.id],['user_id','owner']]);});
test('duplicate ID confirms only matching content and owner',async()=>{for(const options of [{duplicate:true,readContent:'different'},{duplicate:true,readOwner:'other'}])assert.equal((await executeWebNote(fake(options).db,input)).ok,false);assert.equal((await executeWebNote(fake({duplicate:true}).db,input)).ok,true);});
test('account mismatch rejects before insert; account change rejects success receipt',async()=>{const {db,calls}=fake({owner:'other'});assert.equal((await executeWebNote(db,input)).ok,false);assert.deepEqual(calls,[]);assert.equal((await executeWebNote(fake({changed:true}).db,input)).ok,false);});
test('invalid and denied notes never report success or leak provider errors',async()=>{const {db,calls}=fake();assert.equal((await executeWebNote(db,{...input,content:' '})).ok,false);assert.equal((await executeWebNote(db,{...input,id:'bad'})).ok,false);assert.equal(calls.length,0);assert.equal((await executeWebNote(fake({error:true}).db,input)).ok,false);db.auth.getUser=async()=>{throw Error('PRIVATE_BACKEND_DETAIL');};const result=await executeWebNote(db,input);assert.equal(result.ok,false);assert(!JSON.stringify(result).includes('PRIVATE_BACKEND_DETAIL'));});

test('privileged writer is constructed only after validated owner and supplies fixed note fields',async()=>{
 let constructed=0;const denied=fake({owner:'other'});const writer=fake();
 const makeWriter=()=>{constructed++;return writer.db;};
 assert.equal((await executeWebNote(denied.db,input,makeWriter)).ok,false);assert.equal(constructed,0);
 const allowed=fake();assert.equal((await executeWebNote(allowed.db,input,makeWriter,'me-plus-mobile')).ok,true);
 assert.equal(constructed,1);assert.equal(writer.calls[0].row.user_id,'owner');assert.equal(writer.calls[0].row.channel,'me-plus-mobile');assert.equal(writer.calls[0].row.processing_status,'captured');assert.equal(writer.calls[0].row.data_source_id,undefined);
});
