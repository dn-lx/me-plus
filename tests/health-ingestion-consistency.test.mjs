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

test("raw provider revisions are preserved before canonical normalization", () => {
  const ingest = section("export async function ingestHealthReadings");
  const revisions = ingest.indexOf("await storeRawEventRevisions");
  const canonicalRaw = ingest.indexOf("await bulkSyncRawEvents");
  const normalized = ingest.indexOf("await bulkSyncObservations");

  assert.ok(revisions >= 0);
  assert.ok(canonicalRaw > revisions);
  assert.ok(normalized > canonicalRaw);
});

test("provider revision history is idempotent per source, external ID and revision key", () => {
  const revisions = section(
    "async function storeRawEventRevisions",
    "async function bulkSyncRawEvents",
  );
  assert.match(
    revisions,
    /onConflict:\s*"data_source_id,external_record_id,revision_key"/,
  );
  assert.match(revisions, /ignoreDuplicates:\s*true/);
});

test("canonical raw events route provider revisions through the freshness decision state machine", () => {
  const rawSync = section("async function bulkSyncRawEvents", "async function bulkSyncObservations");
  assert.match(rawSync, /const decision = decideProviderRevision\(/);
  assert.match(rawSync, /if \(decision === "ignore"\)/);
  assert.match(rawSync, /recordsIgnoredStale \+= 1/);
  assert.match(rawSync, /else if \(decision === "update"\)/);
  assert.match(rawSync, /else \{\s*recordsResumed \+= 1/);
});

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

test("large reconciliation lookups are chunked before PostgREST IN filters", () => {
  assert.match(source, /function chunkValues<T>\(values: readonly T\[\], size = 25\)/);
  const rawSync = section("async function bulkSyncRawEvents", "async function bulkSyncObservations");
  const observationSync = section("async function bulkSyncObservations", "async function markRawEventsProcessed");
  assert.match(rawSync, /for \(const externalIdChunk of chunkValues\(externalIds\)\)/);
  assert.match(rawSync, /\.in\("external_record_id", externalIdChunk\)/);
  assert.match(observationSync, /for \(const rawEventIdChunk of chunkValues\(rawEventIds as string\[\]\)\)/);
  assert.match(observationSync, /\.in\("raw_event_id", rawEventIdChunk\)/);
});
