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
const LAST_ATTEMPT_KEY = "me-plus.health-connect.last-attempt-at.v1";
const LAST_ERROR_KEY = "me-plus.health-connect.last-error.v1";

let inFlight: Promise<ForegroundHealthSyncResult> | null = null;

export type ForegroundHealthSyncResult = {
  status: "synced" | "skipped";
  mode: "changes" | "bootstrap" | "none";
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

  if (
    !force &&
    previousAttempt !== null &&
    now - previousAttempt < HEALTH_FOREGROUND_POLL_INTERVAL_MS
  ) {
    return skipped("foreground_throttle");
  }

  const result = await runForegroundHealthSync();
  if (result.status === "synced") {
    localStorage.setItem(LAST_ATTEMPT_KEY, new Date(now).toISOString());
  }

  return result;
}

export function runForegroundHealthSync() {
  if (inFlight) {
    return inFlight;
  }

  inFlight = runForegroundHealthSyncInternal().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function runForegroundHealthSyncInternal(): Promise<ForegroundHealthSyncResult> {
  if (Platform.OS !== "android") {
    return skipped("not_android");
  }

  const [{ data, error }, permissions] = await Promise.all([
    supabase.auth.getSession(),
    getHealthConnectPermissionState(),
  ]);

  if (error) {
    throw new Error(`Unable to read Me+ session: ${error.message}`);
  }

  if (!data.session) {
    return skipped("not_authenticated");
  }

  if (permissions.recordReadPermissionCount === 0) {
    return skipped("health_connect_read_permission_missing");
  }

  const savedToken = readLocal(CHANGES_TOKEN_KEY);

  try {
    if (savedToken) {
      return await syncFromChanges(savedToken);
    }
    return await bootstrapSync();
  } catch (error) {
    persistLastError(error);
    throw error;
  }
}

async function syncFromChanges(initialToken: string): Promise<ForegroundHealthSyncResult> {
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
    return bootstrapSync();
  }

  localStorage.removeItem(LAST_ERROR_KEY);

  return {
    status: "synced",
    mode: "changes",
    recordsSeen: totals.recordsSeen,
    recordsCreated: totals.recordsCreated,
    recordsUpdated: totals.recordsUpdated,
    pagesRead: drained.pagesRead,
    deletionChangesSeen: drained.deletionChangesSeen,
  };
}

async function bootstrapSync(): Promise<ForegroundHealthSyncResult> {
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
  localStorage.removeItem(LAST_ERROR_KEY);

  return {
    status: "synced",
    mode: "bootstrap",
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

function skipped(detail: string): ForegroundHealthSyncResult {
  return {
    status: "skipped",
    mode: "none",
    recordsSeen: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    pagesRead: 0,
    deletionChangesSeen: 0,
    detail,
  };
}

function persistLastError(error: unknown) {
  const message = error instanceof Error ? error.message : "Health sync failed";
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
