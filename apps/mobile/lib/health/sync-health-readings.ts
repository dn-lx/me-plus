import type {
  HealthConnectRawRecord,
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { supabase } from "../supabase/client";

const MAX_READINGS_PER_REQUEST = 150;
const MAX_RAW_RECORDS_PER_REQUEST = 40;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

export type HealthSyncSummary = {
  sourceCount: number;
  batchCount: number;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  rawRecordsSeen: number;
  rawRecordsCreated: number;
  rawRecordsUpdated: number;
  dataSourceIds: string[];
  syncRunIds: string[];
};

type HealthConnectSyncMetadata = {
  windowStart?: string;
  windowEnd?: string;
  mode?: "manual" | "background";
};

function getApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_ME_PLUS_API_URL;
  if (!value) throw new Error("Missing EXPO_PUBLIC_ME_PLUS_API_URL");
  return value.replace(/\/$/, "");
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Unable to read Supabase session: ${error.message}`);

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Health sync requires an authenticated Supabase session");
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
  return postHealthBatch(
    {
      source,
      readings,
      ...(cursorAfter ? { cursorAfter } : {}),
    },
    accessToken,
  );
}

export async function syncHealthConnectData(
  readings: readonly SensorReading[],
  rawRecords: readonly HealthConnectRawRecord[],
  metadata: HealthConnectSyncMetadata = {},
): Promise<HealthSyncSummary> {
  if (readings.length === 0 && rawRecords.length === 0) return emptySummary();

  const accessToken = await getAccessToken();
  const packages = new Set<string>();
  for (const reading of readings) packages.add(reading.provenance.sourcePackage);
  for (const record of rawRecords) packages.add(record.provenance.sourcePackage);

  const summary = emptySummary();
  summary.sourceCount = packages.size;
  const dataSourceIds = new Set<string>();

  for (const sourcePackage of packages) {
    const source: HealthIngestSource = {
      provider: "health-connect",
      displayName: `Health Connect · ${sourcePackage}`,
      externalAccountRef: sourcePackage,
      metadata: {
        collector: "me-plus-android",
        ingestionVersion: 4,
        healthConnectOrigin: sourcePackage,
        syncMode: metadata.mode ?? "manual",
        ...(metadata.windowStart ? { windowStart: metadata.windowStart } : {}),
        ...(metadata.windowEnd ? { windowEnd: metadata.windowEnd } : {}),
      },
    };

    const sourceRawRecords = rawRecords.filter(
      (record) => record.provenance.sourcePackage === sourcePackage,
    );
    for (let index = 0; index < sourceRawRecords.length; index += MAX_RAW_RECORDS_PER_REQUEST) {
      const batch = sourceRawRecords.slice(index, index + MAX_RAW_RECORDS_PER_REQUEST);
      const result = await postHealthBatch(
        {
          source,
          readings: [],
          rawRecords: batch,
          cursorAfter: latestTimestamp(batch),
        },
        accessToken,
      );
      accumulate(summary, result, dataSourceIds);
    }

    const sourceReadings = readings.filter(
      (reading) => reading.provenance.sourcePackage === sourcePackage,
    );
    for (let index = 0; index < sourceReadings.length; index += MAX_READINGS_PER_REQUEST) {
      const batch = sourceReadings.slice(index, index + MAX_READINGS_PER_REQUEST);
      const result = await postHealthBatch(
        {
          source,
          readings: batch,
          cursorAfter: latestTimestamp(batch),
        },
        accessToken,
      );
      accumulate(summary, result, dataSourceIds);
    }
  }

  summary.dataSourceIds = [...dataSourceIds];
  return summary;
}

function accumulate(
  summary: HealthSyncSummary,
  result: HealthIngestResult,
  dataSourceIds: Set<string>,
): void {
  summary.batchCount += 1;
  summary.recordsSeen += result.recordsSeen;
  summary.recordsCreated += result.recordsCreated;
  summary.recordsUpdated += result.recordsUpdated;
  summary.rawRecordsSeen += result.rawRecordsSeen ?? 0;
  summary.rawRecordsCreated += result.rawRecordsCreated ?? 0;
  summary.rawRecordsUpdated += result.rawRecordsUpdated ?? 0;
  dataSourceIds.add(result.dataSourceId);
  summary.syncRunIds.push(result.syncRunId);
}

function emptySummary(): HealthSyncSummary {
  return {
    sourceCount: 0,
    batchCount: 0,
    recordsSeen: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    rawRecordsSeen: 0,
    rawRecordsCreated: 0,
    rawRecordsUpdated: 0,
    dataSourceIds: [],
    syncRunIds: [],
  };
}

function latestTimestamp(
  records: readonly { lastModifiedAt: string; observedAt: string }[],
): string | undefined {
  return records
    .flatMap((record) => [record.lastModifiedAt, record.observedAt])
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1);
}
