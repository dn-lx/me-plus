import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../apps/web/lib/health/ingest.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

function section(startMarker, endMarker = null) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("raw health events remain non-terminal until normalization succeeds", () => {
  const rawSync = section("async function bulkSyncRawEvents", "async function bulkSyncObservations");
  assert.match(rawSync, /processing_status:\s*"pending"/);
  assert.match(rawSync, /processed_at:\s*null/);
  assert.doesNotMatch(rawSync, /processing_status:\s*"processed"/);
});

test("health ingestion marks raw events processed only after normalized observations", () => {
  const ingest = section("export async function ingestHealthReadings");
  const raw = ingest.indexOf("await bulkSyncRawEvents");
  const normalized = ingest.indexOf("await bulkSyncObservations");
  const processed = ingest.indexOf("await markRawEventsProcessed");
  const completed = ingest.indexOf('status: "completed"');

  assert.ok(raw >= 0 && normalized > raw);
  assert.ok(processed > normalized);
  assert.ok(completed > processed);
});

test("failed normalization records raw failure without masking later-stage failures", () => {
  const ingest = section("export async function ingestHealthReadings");
  assert.match(ingest, /rawEventIds\.length > 0 && !observationsWritten/);
  assert.match(ingest, /await markRawEventsFailed/);
  assert.match(ingest, /try \{\s*await markSyncRunFailed/);
});
