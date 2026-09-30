import assert from 'node:assert/strict';
import test from 'node:test';
import { postHealthBatch } from '../apps/mobile/lib/health/transport.ts';
import { sampleSourcePayload } from '../apps/mobile/lib/health/sample-source-payload.ts';
import { parseHealthIngestRequest } from '../apps/web/lib/health/validate-ingest.ts';

const reading = { externalId:'record-1', metric:'heart-rate', value:70, unit:'bpm',
  observedAt:'2026-09-29T10:00:00Z', lastModifiedAt:'2026-09-29T10:01:00Z',
  provenance:{provider:'health-connect',sourcePackage:'com.example.health'} };
const payload = {source:{provider:'health-connect',displayName:'Test'},readings:[reading]};
const result = {dataSourceId:'source',syncRunId:'run',recordsSeen:1,recordsCreated:1,recordsUpdated:0,observationIds:['observation']};
const ok = () => new Response(JSON.stringify(result),{status:200});

test('transient HTML errors retry the same authenticated batch with bounded backoff',async()=>{
  let calls=0;const delays=[];
  const actual=await postHealthBatch(payload,'test-token','https://example.test/api',{
    fetch:async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer test-token');assert.deepEqual(JSON.parse(init.body),payload);return ++calls===1?new Response('<html>upstream unavailable</html>',{status:504}):ok();},
    wait:async ms=>{delays.push(ms);},
  });
  assert.deepEqual(actual,result);assert.equal(calls,2);assert.deepEqual(delays,[750]);
});
test('authorization and invalid-payload failures are not retried',async()=>{
  for(const status of [400,401,403]){let calls=0;await assert.rejects(postHealthBatch(payload,'test-token','https://example.test/api',{fetch:async()=>{calls++;return new Response('denied',{status});},wait:async()=>{}}),new RegExp(String(status)));assert.equal(calls,1);}
});
test('invalid success acknowledgements never count as uploaded',async()=>{
  for(const body of ['<html>ok</html>','{}',JSON.stringify({...result,recordsSeen:99}),JSON.stringify({...result,recordsCreated:-1})]){
    let calls=0;await assert.rejects(postHealthBatch(payload,'test-token','https://example.test/api',{fetch:async()=>{calls++;return new Response(body);},wait:async()=>{}}),/invalid upload acknowledgement/);assert.equal(calls,1);
  }
});
test('network timeouts abort and stop after three attempts',async()=>{
  let calls=0;const delays=[];
  await assert.rejects(postHealthBatch(payload,'test-token','https://example.test/api',{
    timeoutMs:5,
    fetch:async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));},
    wait:async ms=>{delays.push(ms);},
  }),/timed out/);
  assert.equal(calls,3);assert.deepEqual(delays,[750,1500]);
});
test('heart-rate samples preserve all raw values with linear payload growth',()=>{
  const samples=Array.from({length:1000},(_,i)=>({time:`sample-${i}`,beatsPerMinute:60+i%30}));
  const record={recordType:'HeartRate',startTime:'start',endTime:'end',metadata:{id:'provider-id',dataOrigin:'com.zepp'},samples};
  const mapped=samples.map((sample,i)=>sampleSourcePayload(record,sample,i));
  assert.deepEqual(mapped.flatMap(x=>x.sourceRecord.samples),samples);
  assert.deepEqual(mapped[0].metadata,record.metadata);
  assert.equal(record.samples.length,1000);
  assert.ok(JSON.stringify(mapped).length < 700000);
});
test('server rejects batches larger than 100 readings before writing',()=>{
  assert.throws(()=>parseHealthIngestRequest({...payload,readings:Array.from({length:101},()=>reading)}),/limited to 100 readings/);
});
