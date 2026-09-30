import type {
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { supabase } from "../supabase/client";
import { postHealthBatch as postBatch } from "./transport";

// Bound each authenticated upload below backend limits.
const MAX_READINGS_PER_REQUEST = 50;

export type HealthSyncSummary = {
  sourceCount: number;
  batchCount: number;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  dataSourceIds: string[];
  syncRunIds: string[];
};

type HealthConnectSyncMetadata = {
  windowStart?: string;
  windowEnd?: string;
};

function getApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_ME_PLUS_API_URL;

  if (!value) {
    throw new Error("Missing EXPO_PUBLIC_ME_PLUS_API_URL");
  }

  return value.replace(/\/$/, "");
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Unable to read Supabase session: ${error.message}`);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Health sync requires an authenticated Supabase session");
  }

  return accessToken;
}

async function postHealthBatch(payload: HealthIngestRequest, accessToken: string) {
  return postBatch(payload, accessToken, `${getApiBaseUrl()}/api/health/ingest`);
}

export async function syncHealthReadings(
  readings: readonly SensorReading[],
  source: HealthIngestSource,
  cursorAfter?: string,
): Promise<HealthIngestResult> {
  const accessToken = await getAccessToken();
  const payload: HealthIngestRequest = {
    source,
    readings,
    ...(cursorAfter ? { cursorAfter } : {}),
  };

  return postHealthBatch(payload, accessToken);
}

export async function syncHealthConnectReadings(
  readings: readonly SensorReading[],
  metadata: HealthConnectSyncMetadata = {},
): Promise<HealthSyncSummary> {
  if (readings.length === 0) {
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

  const bySource = new Map<string, SensorReading[]>();

  for (const reading of readings) {
    const sourcePackage = reading.provenance.sourcePackage;
    const sourceReadings = bySource.get(sourcePackage) ?? [];
    sourceReadings.push(reading);
    bySource.set(sourcePackage, sourceReadings);
  }

  let batchCount = 0;
  let recordsSeen = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const dataSourceIds = new Set<string>();
  const syncRunIds: string[] = [];

  for (const [sourcePackage, sourceReadings] of bySource) {
    const source: HealthIngestSource = {
      provider: "health-connect",
      displayName: `Health Connect · ${sourcePackage}`,
      externalAccountRef: sourcePackage,
      metadata: {
        collector: "me-plus-android",
        healthConnectOrigin: sourcePackage,
        ...(metadata.windowStart ? { windowStart: metadata.windowStart } : {}),
        ...(metadata.windowEnd ? { windowEnd: metadata.windowEnd } : {}),
      },
    };

    for (let index = 0; index < sourceReadings.length; index += MAX_READINGS_PER_REQUEST) {
      const batch = sourceReadings.slice(index, index + MAX_READINGS_PER_REQUEST);
      const cursorAfter = latestTimestamp(batch);
      const payload: HealthIngestRequest = {
        source,
        readings: batch,
        ...(cursorAfter ? { cursorAfter } : {}),
      };
      const result = await postHealthBatch(payload, await getAccessToken());

      batchCount += 1;
      recordsSeen += result.recordsSeen;
      recordsCreated += result.recordsCreated;
      recordsUpdated += result.recordsUpdated;
      dataSourceIds.add(result.dataSourceId);
      syncRunIds.push(result.syncRunId);
    }
  }

  return {
    sourceCount: bySource.size,
    batchCount,
    recordsSeen,
    recordsCreated,
    recordsUpdated,
    dataSourceIds: [...dataSourceIds],
    syncRunIds,
  };
}

function latestTimestamp(readings: readonly SensorReading[]): string | undefined {
  return readings
    .flatMap((reading) => [reading.lastModifiedAt, reading.observedAt])
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1);
}

