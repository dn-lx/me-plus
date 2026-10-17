import assert from 'node:assert/strict';
import test from 'node:test';
import { saveCaptureNote } from '../apps/mobile/lib/capture-note.ts';
function fixture() {
  let owner='a';const rows=new Map();const filters=[];let inserts=0;
  const db={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},from:table=>({
    insert:async row=>{inserts++;if(rows.has(row.id))return{error:{code:'23505'}};rows.set(row.id,row);return{error:null};},
    select(){assert.equal(table,'conversation_captures');return this;},eq(k,v){filters.push([k,v]);return this;},
    maybeSingle:async()=>({data:rows.get('stable'),error:null}),
  })};
  return{db,rows,filters,setOwner:value=>{owner=value;},inserts:()=>inserts};
}
test('lost note acknowledgement replays a stable identity and confirms exact owner/text',async()=>{
  const f=fixture();await saveCaptureNote(f.db,'a','stable',' My thought ');await saveCaptureNote(f.db,'a','stable',' My thought ');
  assert.equal(f.rows.size,1);assert.equal(f.rows.get('stable').content,'My thought');
  assert.ok(f.filters.some(([key,value])=>key==='user_id'&&value==='a'));
});
test('wrong owner and invalid notes cannot begin a write',async()=>{
  const f=fixture();f.setOwner('b');await assert.rejects(saveCaptureNote(f.db,'a','stable','note'),/same account/);
  assert.equal(f.inserts(),0);await assert.rejects(saveCaptureNote(f.db,'b','stable',' '),/Write a note/);
});
test('a different existing payload cannot be claimed as a confirmed save',async()=>{
  const f=fixture();f.rows.set('stable',{id:'stable',user_id:'a',content:'Other text'});
  await assert.rejects(saveCaptureNote(f.db,'a','stable','New text'),/not confirmed/);
});
