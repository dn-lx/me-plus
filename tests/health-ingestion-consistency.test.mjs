import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ingestSource = await readFile(
  new URL("../apps/web/lib/health/ingest.ts", import.meta.url),
  "utf8",
);
const mobileSource = await readFile(
  new URL("../apps/mobile/lib/health/background-health-sync.ts", import.meta.url),
  "utf8",
);
const collectorSource = await readFile(
  new URL("../apps/mobile/lib/health/health-connect.ts", import.meta.url),
  "utf8",
);

function section(source, startMarker, endMarker = null) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("normalized health source events remain non-terminal until observation write succeeds", () => {
  const rawSync = section(
    ingestSource,
    "async function bulkSyncReadingRawEvents",
    "async function bulkSyncObservations",
  );
  assert.match(rawSync, /processing_status:\s*"pending"/);
  assert.match(rawSync, /processed_at:\s*null/);
});

test("health ingestion marks normalized source events processed only after observations", () => {
  const ingest = section(ingestSource, "export async function ingestHealthReadings");
  const raw = ingest.indexOf("await bulkSyncReadingRawEvents");
  const normalized = ingest.indexOf("await bulkSyncObservations");
  const processed = ingest.indexOf("await markReadingRawEventsProcessed");
  const completed = ingest.indexOf('status: "completed"');

  assert.ok(raw >= 0 && normalized > raw);
  assert.ok(processed > normalized);
  assert.ok(completed > processed);
});

test("failed normalization records raw failure without masking sync-run failure", () => {
  const ingest = section(ingestSource, "export async function ingestHealthReadings");
  assert.match(ingest, /readingRawEventIds\.length > 0 && !observationsWritten/);
  assert.match(ingest, /await markReadingRawEventsFailed/);
  assert.match(ingest, /try \{\s*await markSyncRunFailed/);
});

test("duplicate external ids choose the newest lastModifiedAt value", () => {
  const newest = section(ingestSource, "function newest", "function dedupeReadings");
  const dedupe = section(ingestSource, "function dedupeReadings", "function dedupeRawRecords");
  assert.match(newest, /rightModified > leftModified/);
  assert.match(dedupe, /newest\(prior, reading\)/);
});

test("all requested physical Health Connect records are preserved as raw provider data", () => {
  assert.match(collectorSource, /HealthRateVariabilityRmssd|HeartRateVariabilityRmssd/);
  assert.match(collectorSource, /BloodPressure/);
  assert.match(collectorSource, /BodyFat/);
  assert.match(collectorSource, /SkinTemperature/);
  assert.match(collectorSource, /Vo2Max/);
  assert.match(collectorSource, /rawRecords:\s*results\.flatMap/);
});

test("periodic collector uses Android background task and authenticated sync", () => {
  assert.match(mobileSource, /TaskManager\.defineTask/);
  assert.match(mobileSource, /minimumInterval:\s*MINIMUM_INTERVAL_MINUTES/);
  assert.match(mobileSource, /hasHealthConnectBackgroundAccess/);
  assert.match(mobileSource, /syncHealthConnectData/);
  assert.match(mobileSource, /supabase\.auth\.getSession/);
});

test("health raw-event existence lookups are chunked before PostgREST queries", () => {
  const lookup = section(ingestSource, "async function existingExternalIds", "async function bulkSyncProviderRawRecords");
  assert.match(lookup, /lookupChunkSize = 40/);
  assert.match(lookup, /externalIds\.slice\(index, index \+ lookupChunkSize\)/);
});

test("authenticated Health Connect ingestion records source consent", () => {
  const consent = section(ingestSource, "async function ensureHealthConsent", "async function startSyncRun");
  assert.match(consent, /domain:\s*"health"/);
  assert.match(consent, /health_connect_sensor_collection_and_analysis/);
  assert.match(consent, /android_health_connect_permission_and_authenticated_upload/);
});
