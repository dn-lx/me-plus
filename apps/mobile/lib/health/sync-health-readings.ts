import type {
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { supabase } from "../supabase/client";

const MAX_READINGS_PER_REQUEST = 500;

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

export async function syncHealthReadings(
  readings: readonly SensorReading[],
  source: HealthIngestSource,
  cursorAfter?: string,
): Promise<HealthIngestResult> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Unable to read Supabase session: ${error.message}`);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Health sync requires an authenticated Supabase session");
  }

  const payload: HealthIngestRequest = {
    source,
    readings,
    ...(cursorAfter ? { cursorAfter } : {}),
  };

  const response = await fetch(`${getApiBaseUrl()}/api/health/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body: unknown = await response.json();

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(`Health sync failed (${response.status}): ${detail}`);
  }

  return body as HealthIngestResult;
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
      const result = await syncHealthReadings(batch, source, cursorAfter);

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
