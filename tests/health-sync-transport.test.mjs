import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../apps/mobile/lib/health/sync-health-readings.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

test("mobile health sync uses bounded request batches", () => {
  assert.match(source, /const MAX_READINGS_PER_REQUEST = 200/);
  assert.match(
    source,
    /sourceReadings\.slice\(index, index \+ MAX_READINGS_PER_REQUEST\)/,
  );
});

test("timeout and transient upstream failures are retried with a bound", () => {
  assert.match(source, /const MAX_ATTEMPTS = 3/);
  for (const status of [408, 429, 502, 503, 504]) {
    assert.match(source, new RegExp(String(status)));
  }
  assert.match(source, /750 \* 2 \*\* \(attempt - 1\)/);
});

test("HTML or other non-JSON error bodies do not crash JSON parsing", () => {
  assert.match(source, /function parseResponseBody/);
  assert.match(source, /catch \{\s*return null;\s*\}/);
  assert.match(source, /response\.text\(\)/);
  assert.doesNotMatch(source, /await response\.json\(\)/);
});

test("successful responses still require a JSON object", () => {
  assert.match(source, /response\.ok/);
  assert.match(source, /typeof body !== "object" \|\| body === null/);
});
