import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { supabase } from "../supabase/client";
import { hasHealthConnectBackgroundAccess, scanHealthConnect } from "./health-connect";
import { syncHealthConnectData, type HealthSyncSummary } from "./sync-health-readings";

export const HEALTH_BACKGROUND_TASK = "me-plus-health-connect-periodic-sync";
const STATUS_KEY = "meplus.health.background.status.v1";
const DEFAULT_WINDOW_DAYS = 3;
const MINIMUM_INTERVAL_MINUTES = 180;

export type HealthBackgroundStatus = {
  registered: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSummary: HealthSyncSummary | null;
};

TaskManager.defineTask(HEALTH_BACKGROUND_TASK, async () => {
  const attemptedAt = new Date().toISOString();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (!data.session) {
      writeStatus({
        registered: true,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: null,
        lastError: "No authenticated Me+ session is available.",
        lastSummary: null,
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    if (!(await hasHealthConnectBackgroundAccess())) {
      writeStatus({
        registered: true,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: null,
        lastError: "Health Connect background-read permission is not granted.",
        lastSummary: null,
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const scan = await scanHealthConnect(DEFAULT_WINDOW_DAYS);
    const summary = await syncHealthConnectData(scan.readings, scan.rawRecords, {
      windowStart: scan.inventory.windowStart,
      windowEnd: scan.inventory.windowEnd,
      mode: "background",
    });

    writeStatus({
      registered: true,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      lastSummary: summary,
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    writeStatus({
      registered: true,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: readStatus().lastSuccessAt,
      lastError: toErrorMessage(error),
      lastSummary: readStatus().lastSummary,
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerHealthBackgroundSync(): Promise<void> {
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(HEALTH_BACKGROUND_TASK);
  if (!alreadyRegistered) {
    await BackgroundTask.registerTaskAsync(HEALTH_BACKGROUND_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  }

  writeStatus({
    ...readStatus(),
    registered: true,
  });
}

export async function unregisterHealthBackgroundSync(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(HEALTH_BACKGROUND_TASK);
  if (registered) {
    await BackgroundTask.unregisterTaskAsync(HEALTH_BACKGROUND_TASK);
  }

  writeStatus({
    ...readStatus(),
    registered: false,
  });
}

export async function isHealthBackgroundSyncRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(HEALTH_BACKGROUND_TASK);
}

export function getHealthBackgroundStatus(): HealthBackgroundStatus {
  return readStatus();
}

function readStatus(): HealthBackgroundStatus {
  const fallback: HealthBackgroundStatus = {
    registered: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastSummary: null,
  };

  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<HealthBackgroundStatus>;
    return {
      registered: parsed.registered === true,
      lastAttemptAt: typeof parsed.lastAttemptAt === "string" ? parsed.lastAttemptAt : null,
      lastSuccessAt: typeof parsed.lastSuccessAt === "string" ? parsed.lastSuccessAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      lastSummary: parsed.lastSummary ?? null,
    };
  } catch {
    return fallback;
  }
}

function writeStatus(status: HealthBackgroundStatus): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // Background sync must not fail solely because status telemetry could not persist.
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown periodic Health Connect sync error";
}
