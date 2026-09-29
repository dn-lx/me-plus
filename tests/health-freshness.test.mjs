import assert from "node:assert/strict";
import test from "node:test";

import {
  compareProviderRevision,
  dedupeReadingsByFreshness,
  providerRevisionKey,
} from "../apps/web/lib/health/freshness.ts";

function reading(overrides = {}) {
  return {
    externalId: "record-1",
    metric: "heart-rate",
    value: 70,
    unit: "bpm",
    observedAt: "2026-09-29T10:00:00.000Z",
    lastModifiedAt: "2026-09-29T10:05:00.000Z",
    provenance: {
      provider: "health-connect",
      sourcePackage: "com.example.health",
    },
    sourcePayload: { sample: 1 },
    ...overrides,
  };
}

test("newest provider lastModifiedAt wins regardless of encounter order", () => {
  const older = reading({
    value: 65,
    lastModifiedAt: "2026-09-29T10:01:00.000Z",
  });
  const newer = reading({
    value: 72,
    lastModifiedAt: "2026-09-29T10:09:00.000Z",
  });

  assert.equal(dedupeReadingsByFreshness([older, newer])[0].value, 72);
  assert.equal(dedupeReadingsByFreshness([newer, older])[0].value, 72);
  assert.ok(compareProviderRevision(newer, older) > 0);
});

test("equal modification timestamps use a deterministic tie-breaker", () => {
  const left = reading({
    value: 70,
    sourcePayload: { z: 1, a: 2 },
  });
  const right = reading({
    value: 71,
    sourcePayload: { a: 2, z: 1 },
  });

  const forward = dedupeReadingsByFreshness([left, right])[0];
  const reverse = dedupeReadingsByFreshness([right, left])[0];

  assert.equal(providerRevisionKey(forward), providerRevisionKey(reverse));
  assert.equal(forward.value, reverse.value);
});

test("stable revision keys ignore object property insertion order", () => {
  const left = reading({
    sourcePayload: { nested: { b: 2, a: 1 }, list: [2, 1] },
  });
  const right = reading({
    sourcePayload: { list: [2, 1], nested: { a: 1, b: 2 } },
  });

  assert.equal(providerRevisionKey(left), providerRevisionKey(right));
  assert.equal(compareProviderRevision(left, right), 0);
});

test("deduped output order is deterministic by external ID", () => {
  const a = reading({ externalId: "a" });
  const b = reading({ externalId: "b" });

  assert.deepEqual(
    dedupeReadingsByFreshness([b, a]).map((item) => item.externalId),
    ["a", "b"],
  );
});
