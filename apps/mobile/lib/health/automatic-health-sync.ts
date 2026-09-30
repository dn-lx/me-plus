import "expo-sqlite/localStorage/install";

import { Platform } from "react-native";

import { supabase } from "../supabase/client";
import {
  getHealthConnectPermissionState,
  readHealthConnectChanges,
  scanHealthConnect,
} from "./health-connect";
import { drainHealthChanges } from "./drain-health-changes";
import {
  syncHealthConnectReadings,
  type HealthSyncSummary,
} from "./sync-health-readings";

export const HEALTH_FOREGROUND_POLL_INTERVAL_MS = 60 * 1000;

const BOOTSTRAP_DAYS = 7;
const CHANGES_TOKEN_KEY = "me-plus.health-connect.changes-token.v1";
const LAST_SUCCESS_KEY = "me-plus.health-connect.last-success-at.v1";
const LAST_ATTEMPT_KEY = "me-plus.health-connect.last-attempt-at.v1";
const LAST_ERROR_KEY = "me-plus.health-connect.last-error.v1";

let inFlight: Promise<AutomaticHealthSyncResult> | null = null;

export type AutomaticHealthSyncResult = {
  status: "synced" | "skipped";
  mode: "changes" | "bootstrap" | "none";
  reason: "background" | "foreground";
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  pagesRead: number;
  deletionChangesSeen: number;
  detail?: string;
};

export async function runForegroundHealthSyncIfDue(force = false) {
  const now = Date.now();
  const previousAttempt = parseTimestamp(readLocal(LAST_ATTEMPT_KEY));

  if (!force && previousAttempt !== null && now - previousAttempt < HEALTH_FOREGROUND_POLL_INTERVAL_MS) {
    return {
      status: "skipped",
      mode: "none",
      reason: "foreground",
      recordsSeen: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      pagesRead: 0,
      deletionChangesSeen: 0,
      detail: "foreground_throttle",
    } satisfies AutomaticHealthSyncResult;
  }

  const result = await runAutomaticHealthSync("foreground");
  if (result.status === "synced") {
    localStorage.setItem(LAST_ATTEMPT_KEY, new Date(now).toISOString());
  }
  return result;
}

export function runAutomaticHealthSync(reason: "background" | "foreground") {
  if (inFlight) {
    return inFlight;
  }

  inFlight = runAutomaticHealthSyncInternal(reason).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function runAutomaticHealthSyncInternal(
  reason: "background" | "foreground",
): Promise<AutomaticHealthSyncResult> {
  if (Platform.OS !== "android") {
    return skipped(reason, "not_android");
  }

  const [{ data, error }, permissions] = await Promise.all([
    supabase.auth.getSession(),
    getHealthConnectPermissionState(),
  ]);

  if (error) {
    throw new Error(`Unable to read Me+ session: ${error.message}`);
  }

  if (!data.session) {
    return skipped(reason, "not_authenticated");
  }

  if (permissions.recordReadPermissionCount === 0) {
    return skipped(reason, "health_connect_read_permission_missing");
  }

  if (reason === "background" && !permissions.backgroundReadGranted) {
    return skipped(reason, "background_read_permission_missing");
  }

  const savedToken = readLocal(CHANGES_TOKEN_KEY);

  try {
    const result = savedToken
      ? await syncFromChanges(savedToken, reason)
      : await bootstrapSync(reason);
    localStorage.setItem(LAST_SUCCESS_KEY, new Date().toISOString());
    localStorage.removeItem(LAST_ERROR_KEY);
    return result;
  } catch (error) {
    persistLastError(error);
    throw error;
  }
}

async function syncFromChanges(
  initialToken: string,
  reason: "background" | "foreground",
): Promise<AutomaticHealthSyncResult> {
  let totals = emptySummary();

  const drained = await drainHealthChanges({
    initialToken,
    readPage: readHealthConnectChanges,
    uploadReadings: async (readings) => {
      const result = await syncHealthConnectReadings(readings);
      totals = mergeSummaries(totals, result);
    },
    saveToken: (token) => {
      localStorage.setItem(CHANGES_TOKEN_KEY, token);
    },
  });

  if (drained.expired) {
    localStorage.removeItem(CHANGES_TOKEN_KEY);
    return bootstrapSync(reason);
  }

  return {
    status: "synced",
    mode: "changes",
    reason,
    recordsSeen: totals.recordsSeen,
    recordsCreated: totals.recordsCreated,
    recordsUpdated: totals.recordsUpdated,
    pagesRead: drained.pagesRead,
    deletionChangesSeen: drained.deletionChangesSeen,
  };
}

async function bootstrapSync(
  reason: "background" | "foreground",
): Promise<AutomaticHealthSyncResult> {
  // Establish the future change cursor before the full scan. Records that arrive
  // during the scan may be uploaded twice, which is safe because ingestion is idempotent.
  const cursorSeed = await readHealthConnectChanges();
  const scan = await scanHealthConnect(BOOTSTRAP_DAYS);

  const result =
    scan.readings.length > 0
      ? await syncHealthConnectReadings(scan.readings, {
          windowStart: scan.inventory.windowStart,
          windowEnd: scan.inventory.windowEnd,
        })
      : emptySummary();

  localStorage.setItem(CHANGES_TOKEN_KEY, cursorSeed.nextChangesToken);

  return {
    status: "synced",
    mode: "bootstrap",
    reason,
    recordsSeen: result.recordsSeen,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
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

function skipped(
  reason: "background" | "foreground",
  detail: string,
): AutomaticHealthSyncResult {
  return {
    status: "skipped",
    mode: "none",
    reason,
    recordsSeen: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    pagesRead: 0,
    deletionChangesSeen: 0,
    detail,
  };
}

function persistLastError(error: unknown) {
  const message = error instanceof Error ? error.message : "Automatic health sync failed";
  localStorage.setItem(LAST_ERROR_KEY, message.slice(0, 240));
}

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function latestModifiedAt(readings: readonly SensorReading[]) {
  return readings
    .map((reading) => reading.lastModifiedAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1);
}
