import "expo-sqlite/localStorage/install";

import { Platform } from "react-native";

import { supabase } from "../supabase/client";
import {
  getHealthConnectPermissionState,
  readHealthConnectChanges,
  scanHealthConnect,
  type HealthConnectRecordType,
} from "./health-connect";
import { drainHealthChanges } from "./drain-health-changes";
import { healthSyncScope } from "./health-sync-scope";
import {
  syncHealthConnectReadings,
  type HealthSyncSummary,
} from "./sync-health-readings";

export const HEALTH_FOREGROUND_POLL_INTERVAL_MS = 60 * 1000;

const BOOTSTRAP_DAYS = 7;
const CHANGES_TOKEN_KEY = "me-plus.health-connect.changes-token.v2";
const LAST_ATTEMPT_KEY = "me-plus.health-connect.last-attempt-at.v2";
const LAST_SUCCESS_KEY = "me-plus.health-connect.last-success-at.v2";
const LAST_ERROR_KEY = "me-plus.health-connect.last-error.v2";

let inFlight: Promise<ForegroundHealthSyncResult> | null = null;

export type ForegroundHealthSyncResult = {
  status: "synced" | "skipped";
  mode: "changes" | "bootstrap" | "none";
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  batchCount: number;
  pagesRead: number;
  deletionChangesSeen: number;
  detail?: string;
};

// A single flight handles overlapping mount, resume, sign-in and timer events.
export function runForegroundHealthSyncIfDue(force = false) {
  if (inFlight) return inFlight;

  inFlight = runForegroundHealthSyncInternal(force).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runForegroundHealthSyncInternal(force: boolean): Promise<ForegroundHealthSyncResult> {
  if (Platform.OS !== "android") return skipped("not_android");

  const [{ data, error }, permissions] = await Promise.all([
    supabase.auth.getSession(),
    getHealthConnectPermissionState(),
  ]);

  if (error) throw new Error(`Unable to read Me+ session: ${error.message}`);
  if (!data.session) return skipped("not_authenticated");
  if (permissions.recordReadTypes.length === 0) return skipped("health_connect_read_permission_missing");

  // A token is valid only for its account and exact set of granted record types.
  // Changing account or revoking/granting a type starts a new one-time bootstrap.
  const scope = healthSyncScope(data.session.user.id, permissions.recordReadTypes);
  const attemptKey = `${LAST_ATTEMPT_KEY}:${scope}`;
  const tokenKey = `${CHANGES_TOKEN_KEY}:${scope}`;
  const successKey = `${LAST_SUCCESS_KEY}:${scope}`;
  const errorKey = `${LAST_ERROR_KEY}:${scope}`;
  const now = Date.now();
  const previousAttempt = parseTimestamp(readLocal(attemptKey));

  if (!force && previousAttempt !== null && now - previousAttempt < HEALTH_FOREGROUND_POLL_INTERVAL_MS) {
    return skipped("foreground_throttle");
  }

  // A failed attempt is retried on the next poll, not on every rerender/resume.
  localStorage.setItem(attemptKey, new Date(now).toISOString());

  try {
    const token = readLocal(tokenKey);
    const result = token
      ? await syncFromChanges(token, tokenKey, permissions.recordReadTypes)
      : await bootstrapSync(tokenKey, permissions.recordReadTypes);
    localStorage.setItem(successKey, new Date().toISOString());
    localStorage.removeItem(errorKey);
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Health sync failed";
    localStorage.setItem(errorKey, message.slice(0, 240));
    throw cause;
  }
}

async function syncFromChanges(
  initialToken: string,
  tokenKey: string,
  recordTypes: readonly HealthConnectRecordType[],
): Promise<ForegroundHealthSyncResult> {
  let totals = emptySummary();
  const drained = await drainHealthChanges({
    initialToken,
    readPage: (token) => readHealthConnectChanges(token, recordTypes),
    uploadReadings: async (readings) => {
      const result = await syncHealthConnectReadings(readings);
      totals = mergeSummaries(totals, result);
    },
    saveToken: (token) => localStorage.setItem(tokenKey, token),
  });

  if (drained.expired) {
    localStorage.removeItem(tokenKey);
    return bootstrapSync(tokenKey, recordTypes);
  }

  return {
    status: "synced",
    mode: "changes",
    recordsSeen: totals.recordsSeen,
    recordsCreated: totals.recordsCreated,
    recordsUpdated: totals.recordsUpdated,
    batchCount: totals.batchCount,
    pagesRead: drained.pagesRead,
    deletionChangesSeen: drained.deletionChangesSeen,
  };
}

async function bootstrapSync(
  tokenKey: string,
  recordTypes: readonly HealthConnectRecordType[],
): Promise<ForegroundHealthSyncResult> {
  // Seed before scanning so changes during the one-time backfill are replayed.
  const cursorSeed = await readHealthConnectChanges(undefined, recordTypes);
  if (!cursorSeed.nextChangesToken) throw new Error("Health Connect returned an empty changes token.");

  const scan = await scanHealthConnect(BOOTSTRAP_DAYS, recordTypes);
  const failedType = scan.inventory.items.find((item) => item.error);
  if (failedType) {
    throw new Error(`Health Connect could not scan ${failedType.recordType}: ${failedType.error}`);
  }

  const result = await syncHealthConnectReadings(scan.readings, {
    windowStart: scan.inventory.windowStart,
    windowEnd: scan.inventory.windowEnd,
  });
  // This is the only full-window upload. All later polls use the changes token.
  localStorage.setItem(tokenKey, cursorSeed.nextChangesToken);

  return {
    status: "synced",
    mode: "bootstrap",
    recordsSeen: result.recordsSeen,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    batchCount: result.batchCount,
    pagesRead: 1,
    deletionChangesSeen: cursorSeed.deletionCount,
  };
}

function emptySummary(): HealthSyncSummary {
  return {
    sourceCount: 0,
    batchCount: 0,
    recordsSeen: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    dataSourceIds: [],
    syncRunIds: [],
  };
}

function mergeSummaries(a: HealthSyncSummary, b: HealthSyncSummary): HealthSyncSummary {
  return {
    sourceCount: new Set([...a.dataSourceIds, ...b.dataSourceIds]).size,
    batchCount: a.batchCount + b.batchCount,
    recordsSeen: a.recordsSeen + b.recordsSeen,
    recordsCreated: a.recordsCreated + b.recordsCreated,
    recordsUpdated: a.recordsUpdated + b.recordsUpdated,
    dataSourceIds: [...new Set([...a.dataSourceIds, ...b.dataSourceIds])],
    syncRunIds: [...a.syncRunIds, ...b.syncRunIds],
  };
}

function skipped(detail: string): ForegroundHealthSyncResult {
  return {
    status: "skipped",
    mode: "none",
    recordsSeen: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    batchCount: 0,
    pagesRead: 0,
    deletionChangesSeen: 0,
    detail,
  };
}

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
