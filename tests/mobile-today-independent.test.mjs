import test from 'node:test';
import assert from 'node:assert/strict';
import {TodayController} from '../apps/mobile/lib/today/today-controller.ts';

const id='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-10-17T12:00:00Z');
const task=(owner)=>({id,title:`${owner} private task`,priority:'must',status:'planned',estimated_minutes:5,instructions:null,due_at:null,available_from:null});
const deferred=()=>{let resolve; const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const f={user:{id:'A'},calls:[],time:now,authGate:null,queryGate:null,rpcGate:null,readbackError:null,readback:undefined,signOutError:null,calendarData:[]};
 let authCallback;
 f.client={auth:{
  async getUser(){const user={...f.user}; const gate=f.authGate;f.authGate=null;if(gate)await gate.promise;return {data:{user},error:null};},
  onAuthStateChange(cb){authCallback=cb;return {data:{subscription:{unsubscribe(){authCallback=null}}}};},
  async signOut(options){f.signOutOptions=options;return {error:f.signOutError};},
 },from(table){
  const call={table,filters:[]};f.calls.push(call);
  const b={select(){return b},eq(k,v){call.filters.push([k,v]);return b},in(){return b},gte(){return b},lte(){return b},gt(){return b},or(){return b},order(){return b},limit(){return b},
   async maybeSingle(){return {data:f.readback===undefined?{...task(f.user.id),status:'completed'}:f.readback,error:f.readbackError};},
   then(ok,bad){const owner=call.filters.find(([k])=>k==='user_id')?.[1];const value={data:table==='actions'?[task(owner)]:table==='calendar_events'?f.calendarData:[],error:null};const gate=table==='actions'?f.queryGate:null;if(gate)f.queryGate=null;return (gate?gate.promise:Promise.resolve()).then(()=>value).then(ok,bad)},
  };return b;
 },async rpc(name,args){f.calls.push({rpc:name,args});if(f.rpcGate)return f.rpcGate.promise;return {data:{ok:true},error:null};}};
 f.switchTo=(owner)=>{f.user={id:owner};authCallback?.('SIGNED_IN',{user:f.user});};
 f.controller=new TodayController(f.client,()=>f.time);return f;
}

for(const [label,readback,error] of [['failed',null,{message:'PRIVATE_DB_DETAIL'}],['missing',null,null],['unconfirmed',{...task('A'),status:'planned'},null]]){
 test(`${label} completion readback never reports success or removes the task`,async()=>{
  const f=fixture();await f.controller.loadToday();f.readback=readback;f.readbackError=error;
  const result=await f.controller.recordDecision(id,'completed');
  assert.equal(result.ok,false);assert.equal(f.controller.getState().actions[0]?.status,'planned');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_DB_DETAIL'));f.controller.destroy();
 });
}

test('two synchronous taps cannot both pass a deferred authentication check',async()=>{
 const f=fixture();await f.controller.loadToday();const gate=deferred();f.authGate=gate;
 const first=f.controller.recordDecision(id,'completed');
 const second=f.controller.recordDecision(id,'completed');
 gate.resolve();const results=await Promise.all([first,second]);
 assert.equal(f.calls.filter(c=>c.rpc).length,1);assert.equal(results.filter(r=>r.ok).length,1);f.controller.destroy();
});

test('late authentication from account A cannot invalidate account B load',async()=>{
 const f=fixture();const gate=deferred();f.authGate=gate;const old=f.controller.loadToday();
 f.switchTo('B');await tick();gate.resolve();await old;await tick();
 assert.equal(f.controller.getState().userId,'B');assert.equal(f.controller.getState().status,'ready');
 assert.equal(f.controller.getState().actions[0]?.title,'B private task');f.controller.destroy();
});

test('switching accounts during decision authentication prevents the stale RPC',async()=>{
 const f=fixture();await f.controller.loadToday();const gate=deferred();f.authGate=gate;
 const old=f.controller.recordDecision(id,'completed');f.switchTo('B');await tick();gate.resolve();await old;
 assert.equal(f.calls.filter(c=>c.rpc).length,0);assert.equal(f.controller.getState().userId,'B');
 assert.equal(f.controller.getState().actionMessage,null);f.controller.destroy();
});

test('old RPC failure cannot place action feedback into the next account',async()=>{
 const f=fixture();await f.controller.loadToday();const gate=deferred();f.rpcGate=gate;
 const old=f.controller.recordDecision(id,'completed');await tick();f.switchTo('B');await tick();
 gate.resolve({data:null,error:{message:'PRIVATE_A_FAILURE'}});await old;
 assert.equal(f.controller.getState().userId,'B');assert.equal(f.controller.getState().actionMessage,null);
 assert.equal(f.controller.getState().submittingActionId,null);f.controller.destroy();
});

test('destroyed controller cannot be repopulated by a late auth response',async()=>{
 const f=fixture();const gate=deferred();f.authGate=gate;const pending=f.controller.loadToday();
 f.controller.destroy();gate.resolve();await pending;
 assert.equal(f.calls.filter(c=>c.table).length,0);assert.equal(f.controller.getState().actions.length,0);
});

test('sign-out failure is reported honestly without exposing the provider error',async()=>{
 const f=fixture();await f.controller.loadToday();f.signOutError={message:'PRIVATE_TOKEN_DETAIL'};
 const result=await f.controller.signOut();assert.equal(result.ok,false);
 assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN_DETAIL'));f.controller.destroy();
});

test('authenticated owner changes clear the old snapshot even without an auth event',async()=>{
 const f=fixture();await f.controller.loadToday();f.user={id:'B'};const gate=deferred();f.queryGate=gate;
 const pending=f.controller.loadToday();await tick();
 assert.equal(f.controller.getState().actions.length,0);assert.equal(f.controller.getState().userId,'B');
 gate.resolve();await pending;f.controller.destroy();
});

test('decisions are refused while a new snapshot is still loading',async()=>{
 const f=fixture();await f.controller.loadToday();const gate=deferred();f.queryGate=gate;
 const pending=f.controller.loadToday();await tick();const result=await f.controller.recordDecision(id,'completed');
 assert.equal(result.ok,false);assert.equal(f.calls.filter(c=>c.rpc).length,0);
 gate.resolve();await pending;f.controller.destroy();
});

test('a refresh started during a write cannot resurrect its old planned snapshot',async()=>{
 const f=fixture();await f.controller.loadToday();const rpc=deferred();f.rpcGate=rpc;
 const write=f.controller.recordDecision(id,'completed');await tick();const query=deferred();f.queryGate=query;
 const refresh=f.controller.loadToday();await tick();rpc.resolve({data:{ok:true},error:null});await write;
 query.resolve();await refresh;
 assert.equal(f.controller.getState().actions.some(a=>a.id===id),false);f.controller.destroy();
});

test('disconnecting this phone requests only local sign-out scope',async()=>{
 const f=fixture();await f.controller.loadToday();const result=await f.controller.signOut();
 assert.equal(result.ok,true);assert.deepEqual(f.signOutOptions,{scope:'local'});f.controller.destroy();
});

test('Now is evaluated at response time when a calendar commitment starts during a slow read',async()=>{
 const f=fixture();f.calendarData=[{starts_at:'2026-10-17T12:01:00Z',ends_at:'2026-10-17T12:30:00Z'}];
 const gate=deferred();f.queryGate=gate;const pending=f.controller.loadToday();await tick();
 f.time=new Date('2026-10-17T12:02:00Z');gate.resolve();await pending;
 assert.equal(f.controller.getState().busyNow,true);assert.equal(f.controller.getState().nowAction,null);f.controller.destroy();
});


test('slow decision cannot recommend an action after its calendar window closes',async()=>{
 const f=fixture();f.calendarData=[{starts_at:'2026-10-17T12:06:00Z',ends_at:'2026-10-17T12:30:00Z'}];
 await f.controller.loadToday();const gate=deferred();f.rpcGate=gate;
 const pending=f.controller.recordDecision(id,'completed');await tick();f.time=new Date('2026-10-17T12:07:00Z');
 gate.resolve({data:null,error:null});assert.equal((await pending).ok,true);
 assert.equal(f.controller.getState().nowAction,null);f.controller.destroy();
});

test('late failed sign-in cannot replace a newly authenticated account',async()=>{
 const f=fixture();const gate=deferred();f.client.auth.signInWithPassword=()=>gate.promise;
 const pending=f.controller.signIn('a@example.test','synthetic');f.switchTo('B');await tick();
 gate.resolve({error:{message:'invalid'}});await pending;
 assert.equal(f.controller.getState().userId,'B');assert.equal(f.controller.getState().status,'ready');f.controller.destroy();
});
