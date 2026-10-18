import assert from 'node:assert/strict';
import test from 'node:test';
import {ingestionCutoff, acceptsObservation, calendarWindow} from '../supabase/functions/_shared/ingestion-window.ts';

test('fresh-start cutoff excludes deleted history but accepts new and revised observations',()=>{
 const cutoff=ingestionCutoff({ingestFrom:'2026-10-16T10:00:00Z'});
 assert.equal(acceptsObservation('2026-10-15T12:00:00Z',cutoff),false);
 assert.equal(acceptsObservation('2026-10-16T10:00:00Z',cutoff),true);
 assert.equal(acceptsObservation('2026-10-17T12:00:00Z',cutoff),true);
 assert.equal(acceptsObservation('invalid',cutoff),false);
 assert.equal(acceptsObservation('2026-09-01T00:00:00Z',ingestionCutoff({})),true);
 for(const value of ['invalid','2026-10-16',123,{}])assert.throws(()=>ingestionCutoff({ingestFrom:value}),/invalid_ingestion_cutoff/);
});
test('calendar snapshot starts at fresh cutoff and keeps its bounded forward window',()=>{
 const now=new Date('2026-10-16T10:00:00Z');
 assert.equal(calendarWindow(now,{ingestFrom:now.toISOString()}).start,now.toISOString());
 assert.equal(calendarWindow(now,{}).start,'2026-10-02T10:00:00.000Z');
 assert.equal(Date.parse(calendarWindow(now,{}).end)-now.getTime(),180*86400000);
 assert.throws(()=>calendarWindow(now,{ingestFrom:'2030-01-01T00:00:00Z'}),/invalid_ingestion_cutoff/);
});
