import type {
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { supabase } from "../supabase/client";

const MAX_READINGS_PER_REQUEST = 50;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

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

function parseResponseBody(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorDetail(body: unknown, responseText: string, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    if ("detail" in body) return String((body as { detail?: unknown }).detail);
    if ("error" in body) return String((body as { error?: unknown }).error);
  }

  const plain = responseText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, 180) || fallback;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postHealthBatch(
  payload: HealthIngestRequest,
  accessToken: string,
): Promise<HealthIngestResult> {
  const url = `${getApiBaseUrl()}/api/health/ingest`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      const body = parseResponseBody(responseText);

      if (response.ok) {
        if (typeof body !== "object" || body === null) {
          throw new Error(
            `Me+ health API returned a non-JSON success response from ${url}. Please retry after updating the app.`,
          );
        }
        return body as HealthIngestResult;
      }

      const detail = errorDetail(body, responseText, response.statusText);
      const failure = new Error(`Health sync failed (${response.status}): ${detail}`);

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_ATTEMPTS) {
        throw failure;
      }

      lastError = failure;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("Unknown health sync network error");
      if (
        attempt === MAX_ATTEMPTS ||
        (failure.message.startsWith("Health sync failed (") &&
          ![...RETRYABLE_STATUS_CODES].some((status) =>
            failure.message.startsWith(`Health sync failed (${status})`),
          ))
      ) {
        throw failure;
      }
      lastError = failure;
    }

    await wait(750 * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error("Health sync failed after retries");
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

  const accessToken = await getAccessToken();
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
      const result = await postHealthBatch(payload, accessToken);

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
