import assert from "node:assert/strict";
import test from "node:test";

import { drainHealthChanges } from "../apps/mobile/lib/health/drain-health-changes.ts";

function reading(id, observedAt = "2026-09-30T00:00:00.000Z") {
  return {
    externalId: id,
    metric: "heart-rate",
    value: 60,
    unit: "bpm",
    observedAt,
    lastModifiedAt: observedAt,
    provenance: {
      provider: "health-connect",
      sourcePackage: "com.huami.watch.hmwatchmanager",
    },
  };
}

test("drains pages and persists a token only after each upload succeeds", async () => {
  const events = [];
  const pages = new Map([
    ["token-1", {
      readings: [reading("a")],
      deletionCount: 0,
      nextChangesToken: "token-2",
      changesTokenExpired: false,
      hasMore: true,
    }],
    ["token-2", {
      readings: [reading("b")],
      deletionCount: 1,
      nextChangesToken: "token-3",
      changesTokenExpired: false,
      hasMore: false,
    }],
  ]);

  const result = await drainHealthChanges({
    initialToken: "token-1",
    readPage: async (token) => pages.get(token),
    uploadReadings: async (readings) => {
      events.push(`upload:${readings.map((item) => item.externalId).join(",")}`);
    },
    saveToken: async (token) => {
      events.push(`save:${token}`);
    },
  });

  assert.deepEqual(events, [
    "upload:a",
    "save:token-2",
    "upload:b",
    "save:token-3",
  ]);
  assert.equal(result.pagesRead, 2);
  assert.equal(result.readingsUploaded, 2);
  assert.equal(result.deletionChangesSeen, 1);
  assert.equal(result.finalToken, "token-3");
  assert.equal(result.expired, false);
});

test("advances across deletion-only pages without inventing an upload", async () => {
  let uploads = 0;
  const saved = [];

  const result = await drainHealthChanges({
    initialToken: "token-1",
    readPage: async () => ({
      readings: [],
      deletionCount: 2,
      nextChangesToken: "token-2",
      changesTokenExpired: false,
      hasMore: false,
    }),
    uploadReadings: async () => {
      uploads += 1;
    },
    saveToken: async (token) => {
      saved.push(token);
    },
  });

  assert.equal(uploads, 0);
  assert.deepEqual(saved, ["token-2"]);
  assert.equal(result.deletionChangesSeen, 2);
});

test("does not advance a token when the upload fails", async () => {
  const saved = [];

  await assert.rejects(
    drainHealthChanges({
      initialToken: "token-1",
      readPage: async () => ({
        readings: [reading("a")],
        deletionCount: 0,
        nextChangesToken: "token-2",
        changesTokenExpired: false,
        hasMore: false,
      }),
      uploadReadings: async () => {
        throw new Error("network down");
      },
      saveToken: async (token) => {
        saved.push(token);
      },
    }),
    /network down/,
  );

  assert.deepEqual(saved, []);
});

test("returns an expired result without advancing the stale token", async () => {
  const saved = [];

  const result = await drainHealthChanges({
    initialToken: "stale-token",
    readPage: async () => ({
      readings: [],
      deletionCount: 0,
      nextChangesToken: "",
      changesTokenExpired: true,
      hasMore: false,
    }),
    uploadReadings: async () => {
      throw new Error("should not upload");
    },
    saveToken: async (token) => {
      saved.push(token);
    },
  });

  assert.equal(result.expired, true);
  assert.equal(result.finalToken, "stale-token");
  assert.deepEqual(saved, []);
});

test("fails closed when pagination claims more data without advancing", async () => {
  await assert.rejects(
    drainHealthChanges({
      initialToken: "token-1",
      readPage: async () => ({
        readings: [],
        deletionCount: 0,
        nextChangesToken: "token-1",
        changesTokenExpired: false,
        hasMore: true,
      }),
      uploadReadings: async () => {},
      saveToken: async () => {},
    }),
    /did not advance/,
  );
});
