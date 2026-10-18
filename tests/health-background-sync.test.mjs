import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { collectHealthChanges } from '../apps/mobile/lib/health/health-sync-engine.ts';
import { syncIsDue, normalizeHealthSyncStatus, HEALTH_SYNC_INTERVAL_MINUTES } from '../apps/mobile/lib/health/sync-policy.ts';

test('three-hour cadence is due at 180 minutes and recovers invalid/future timestamps', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(HEALTH_SYNC_INTERVAL_MINUTES, 180);
  assert.equal(syncIsDue('2026-10-17T09:00:00Z', now), true);
  assert.equal(syncIsDue('2026-10-17T09:00:01Z', now), false);
  for (const value of [null, 'invalid', '2026-10-18T00:00:00Z']) assert.equal(syncIsDue(value, now), true);
});

function harness(seed = { cursor: 'one' }) {
  const state = new Map(Object.entries(seed));
  const calls = [];
  const deps = {
    get: k => state.get(k) ?? null, set: (k,v) => state.set(k,v), remove: k => state.delete(k),
    assertActive: async () => {}, now: () => Date.parse('2026-10-17T12:00:00Z'),
    readChanges: async () => ({ readings: [], nextChangesToken: 'two', hasMore: false, changesTokenExpired: false, deletionCount: 0 }),
    scan: async (start,end) => { calls.push([start,end]); return []; },
    upload: async items => { calls.push(items); },
    fingerprint: async item => createHash('sha256').update(JSON.stringify(item)).digest('hex'),
  };
  return { state, calls, deps };
}
test('failed page keeps cursor; acknowledged batches are bounded to 50 and replay safely', async () => {
  const { state, deps } = harness();
  const batches = [];
  deps.readChanges = async () => ({readings:Array.from({length:121},(_,i)=>({externalId:String(i)})),nextChangesToken:'two',hasMore:false,changesTokenExpired:false,deletionCount:0});
  deps.upload = async rows => { batches.push(rows.length); if (batches.length === 2) throw Error('network'); };
  await assert.rejects(collectHealthChanges(deps), /network/);
  assert.equal(state.get('cursor'), 'one');
  batches.length = 0;
  deps.upload = async rows => {batches.push(rows.length);};
  await collectHealthChanges(deps);
  assert.deepEqual(batches, [50,21]);
  assert.equal(state.get('cursor'), 'two');
});
test('account cancellation after HTTP acknowledgement does not commit a cursor', async () => {
  const {state,deps}=harness();let cancelled=false;
  deps.readChanges=async()=>({readings:[{externalId:'a'}],nextChangesToken:'two',hasMore:false,changesTokenExpired:false,deletionCount:0});
  deps.upload=async()=>{cancelled=true;};
  deps.assertActive=async()=>{if(cancelled)throw Error('account changed');};
  await assert.rejects(collectHealthChanges(deps),/account changed/);
  assert.equal(state.get('cursor'),'one');
});
test('interrupted backfill resumes fixed acknowledged hourly windows without skipping failed window', async () => {
  const {state,deps,calls}=harness({});let count=0;
  deps.scan=async(start,end)=>{calls.push([start,end]);if(++count===3)throw Error('budget');return [];};
  await assert.rejects(collectHealthChanges(deps),/budget/);
  const checkpoint=JSON.parse(state.get('bootstrap'));
  assert.equal(checkpoint.next, checkpoint.start+2*3_600_000);
  assert.equal(state.has('cursor'),false);
  calls.length=0;
  deps.scan=async(start,end)=>{calls.push([start,end]);return [];};
  await collectHealthChanges(deps);
  assert.equal(calls[0][0],checkpoint.next);
  assert.equal(calls.length,166);
  assert.equal(state.has('bootstrap'),false);
  assert.equal(state.get('cursor'),'two');
});
test('snapshot ends after seed allocation so inserts during seed are included', async () => {
  const {deps,calls}=harness({});let now=Date.parse('2026-10-17T12:00:00Z');
  deps.now=()=>now;
  deps.readChanges=async token=>{if(!token) now+=60_000;return {readings:[],nextChangesToken:'seed',hasMore:false,changesTokenExpired:false,deletionCount:0};};
  await collectHealthChanges(deps);
  assert.equal(calls.at(-1)[1],Date.parse('2026-10-17T12:01:00Z'));
});
test('expired changes token bootstraps a fresh window and pagination cycles fail closed', async () => {
  const {state,deps}=harness();let expired=true;
  deps.readChanges=async token=>({readings:[],nextChangesToken:token?'three':'seed',hasMore:false,changesTokenExpired:token==='one'&&expired,deletionCount:0});
  await collectHealthChanges(deps);
  assert.equal(state.get('cursor'),'three');
  state.set('cursor','cycle');
  deps.readChanges=async()=>({readings:[],nextChangesToken:'cycle',hasMore:true,changesTokenExpired:false,deletionCount:0});
  await assert.rejects(collectHealthChanges(deps),/did not advance/);
  assert.equal(state.get('cursor'),'cycle');
});
test('each due sync replays at least one day and extends to an older acknowledged watermark', async () => {
  for (const hours of [3,24,72]) {
    const {deps,calls}=harness();
    deps.replayFrom=deps.now()-hours*3_600_000;
    await collectHealthChanges(deps);
    assert.equal(calls.length,Math.max(24,hours));
    assert.equal(calls[0][0],deps.now()-Math.max(24,hours)*3_600_000);
    assert.equal(calls.at(-1)[1],deps.now());
  }
});
test('failed day replay retains its original unsent window across later attempts', async () => {
  const {deps,state}=harness(); const start=deps.now()-86_400_000;
  deps.replayFrom=start;let scanned=0;
  deps.scan=async()=>{if(++scanned===3)throw Error('offline');return [];};
  await assert.rejects(collectHealthChanges(deps),/offline/);
  const pending=JSON.parse(state.get('replay'));
  assert.equal(pending.next,start+2*3_600_000);
  assert.equal(state.get('cursor'),'one');
  const originalEnd=pending.end;const windows=[];
  deps.now=()=>originalEnd+2*86_400_000;
  deps.replayFrom=deps.now()-86_400_000;
  deps.scan=async(a,b)=>{windows.push([a,b]);return [];};
  await collectHealthChanges(deps);
  assert.equal(windows[0][0],pending.next);
  assert.equal(windows.at(-1)[1],originalEnd);
  assert.equal(state.has('replay'),false);
});

test('dense scan and changes pages resume inside a window after worker deadline', async()=>{
 for(const kind of ['replay','bootstrap','changes']){
  const rows=Array.from({length:5000},(_,i)=>({externalId:String(i),value:i}));
  const {state,deps}=harness(kind==='bootstrap'?{}:{cursor:'one'});
  if(kind==='replay')deps.replayFrom=deps.now()-86_400_000;
  const delivered=new Set();let elapsed=0,attempt=0;
  deps.scan=async()=>rows;
  deps.readChanges=async token=>({readings:kind==='changes'?rows:[],nextChangesToken:token?'two':'seed',hasMore:false,changesTokenExpired:false,deletionCount:0});
  deps.assertActive=async()=>{if(elapsed>=240000)throw Error('deadline');};
  deps.upload=async batch=>{batch.forEach(r=>delivered.add(r.externalId));elapsed+=3000;};
  // For snapshot paths only the first hour is dense; avoid populating all168.
  let firstStart;deps.scan=async start=>{firstStart??=start;return start===firstStart?rows:[];};
  while(state.get('cursor')!=='two'&&attempt++<4){elapsed=0;try{await collectHealthChanges(deps);}catch(e){assert.match(e.message,/deadline/);}}
  assert.equal(state.get('cursor'),'two',kind+' must reach its tail');
  assert.equal(delivered.size,5000);assert(attempt<=2);assert.equal(state.has('acknowledged'),false);
 }
});

test('changed reading with same identity is resent; receipt checkpoints contain digests only',async()=>{
 const {state,deps}=harness();let fail=true;const sent=[];
 let rows=[{externalId:'same',value:1},{externalId:'later',value:2}];
 deps.readChanges=async()=>({readings:rows,nextChangesToken:'two',hasMore:false,changesTokenExpired:false,deletionCount:0});
 deps.upload=async batch=>{sent.push(...batch);};
 let checks=0;deps.assertActive=async()=>{if(fail&&++checks===6)throw Error('interrupted');};
 await assert.rejects(collectHealthChanges(deps),/interrupted/);
 const receipt=state.get('acknowledged');assert(receipt);assert(!receipt.includes('externalId'));assert(!receipt.includes('value'));
 rows=[{externalId:'later',value:2},{externalId:'same',value:3}];fail=false;
 await collectHealthChanges(deps);
 assert.deepEqual(sent.map(x=>x.value),[1,2,3]);
});

 test('interrupted worker status expires without advancing the success watermark',()=>{
 const now=Date.parse('2026-10-18T00:00:00Z'), lastSuccess='2026-10-17T12:00:00Z';
 for(const updatedAt of [undefined,'invalid',new Date(now-300000).toISOString(),new Date(now+1000).toISOString()]) assert.deepEqual(normalizeHealthSyncStatus({state:'running',lastSuccess,updatedAt},now).state,'retry');
 assert.equal(normalizeHealthSyncStatus({state:'running',lastSuccess,updatedAt:new Date(now-299999).toISOString()},now).state,'running');
 assert.equal(normalizeHealthSyncStatus({state:'running',lastSuccess},now).lastSuccess,lastSuccess);
 assert.deepEqual(normalizeHealthSyncStatus({state:'bogus',lastSuccess:'bad'},now),{state:'idle',lastSuccess:null});
 });

