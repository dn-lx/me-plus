import test from 'node:test';
import assert from 'node:assert/strict';
import {n26HistoryStart,n26TransactionInWindow} from '../apps/web/lib/finance/n26-history.ts';
test('N26 preserves an explicit fresh-start day and bounds even an overbroad provider response',()=>{
 const start=n26HistoryStart({ingestFromDate:'2026-10-17'},new Date('2026-10-16T12:00:00Z'));
 assert.equal(start,'2026-10-17');
 assert.equal(n26TransactionInWindow({booking_date:'2026-10-16'},start),false);
 assert.equal(n26TransactionInWindow({booking_date:'2026-10-17'},start),true);
 assert.equal(n26TransactionInWindow({transaction_date:'2026-10-18'},start),true);
 assert.equal(n26TransactionInWindow({},start),false);
 assert.equal(n26TransactionInWindow({booking_date:'2026-99-99',transaction_date:'2026-01-01'},start),false);
 assert.equal(n26TransactionInWindow({booking_date:'2026-02-30'},start),false);
 assert.equal(n26TransactionInWindow({booking_date:'2026-10-17T00:10:00+12:00'},start),false);
 assert.equal(n26HistoryStart({},new Date('2026-10-16T12:00:00Z')),'2026-07-18');
 for(const ingestFromDate of ['invalid','2026-02-30',2])assert.throws(()=>n26HistoryStart({ingestFromDate},new Date()),/invalid_n26_history_start/);
});
