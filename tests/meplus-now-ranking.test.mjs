import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseNowAction} from '../apps/web/lib/now-ranking.ts';

const at = new Date('2026-10-15T10:00:00Z');
const task = (id, extra = {}) => ({
  id, title:id, priority:'should', status:'available',
  estimated_minutes:10, due_at:null, available_from:null, ...extra
});

test('Now respects unavailable future actions', () => {
  const next=chooseNowAction([
    task('future',{priority:'must',available_from:'2026-10-15T11:00:00Z'}),
    task('ready')
  ],at,null);
  assert.equal(next?.id,'ready');
});
test('Now never recommends work during a busy calendar block', () => {
  assert.equal(chooseNowAction([task('must',{priority:'must'})],at,0),null);
});
test('Now selects an action that fits the available minutes', () => {
  const next=chooseNowAction([
    task('long',{priority:'must',estimated_minutes:45}),
    task('short',{priority:'should',estimated_minutes:5})
  ],at,10);
  assert.equal(next?.id,'short');
});
test('Now avoids guessing that unknown-duration actions fit a short gap', () => {
  assert.equal(chooseNowAction([task('unknown',{estimated_minutes:null})],at,12),null);
});
test('Now prefers urgent high-value work over optional tasks', () => {
  const next=chooseNowAction([
    task('optional',{priority:'bonus',due_at:'2026-10-14T09:00:00Z'}),
    task('essential',{priority:'must',due_at:'2026-10-15T12:00:00Z'})
  ],at,null);
  assert.equal(next?.id,'essential');
});
test('Now rejects closed work and handles an empty list', () => {
  assert.equal(chooseNowAction([task('closed',{status:'completed'})],at,null),null);
  assert.equal(chooseNowAction([],at,null),null);
});
