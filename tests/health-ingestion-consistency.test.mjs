import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestAtomicBatch } from '../apps/web/lib/health/ingest-batch.ts';
import { providerRevisionKey } from '../apps/web/lib/health/freshness.ts';

const reading = {externalId:'record-1',metric:'heart-rate',value:70,unit:'bpm',
  observedAt:'2026-09-29T10:00:00Z',lastModifiedAt:'2026-09-29T10:01:00Z',
  provenance:{provider:'health-connect',sourcePackage:'com.example.health'}};
const input={source:{provider:'health-connect',displayName:'Test'},readings:[reading,{...reading,value:72,lastModifiedAt:'2026-09-29T10:09:00Z'}]};
const result={dataSourceId:'source',syncRunId:'run',recordsSeen:2,recordsCreated:1,recordsUpdated:0,observationIds:['observation']};

test('one atomic call preserves all provider revisions and authenticated owner',async()=>{
  let calls=0;
  const actual=await ingestAtomicBatch('verified-user',input,providerRevisionKey,async params=>{
    calls++;assert.equal(params.p_user_id,'verified-user');assert.deepEqual(params.p_input,input);
    assert.deepEqual(params.p_revisions.map(x=>x.reading),input.readings);
    assert.notEqual(params.p_revisions[0].revisionKey,params.p_revisions[1].revisionKey);
    for(const revision of params.p_revisions)assert.match(revision.revisionKey,/^[0-9a-f]{64}$/);
    return {data:result,error:null};
  });assert.deepEqual(actual,result);assert.equal(calls,1);
});
test('atomic rollback and database failures cannot return upload success',async()=>{
  for(const response of [{data:{error:'health_atomic_22P02',syncRunId:'failed'},error:null},{data:null,error:{code:'57014'}},{data:null,error:null}]){
    await assert.rejects(ingestAtomicBatch('verified-user',input,providerRevisionKey,async()=>response),/Unable to ingest health batch/);
  }
});
// Full create/retry/newest/stale/manual-correction/rollback/legacy/denied-role
// database acceptance is reproducible in tests/sql/health-ingestion-atomic.sql.
// Run it as a server role inside its rollback transaction before deployment.
