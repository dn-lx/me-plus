import type {
  HealthConnectRecord,
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { supabase } from "../supabase/client";

const BATCH_SIZE = 250;

function getApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_ME_PLUS_API_URL;

  if (!value) {
    throw new Error("Missing EXPO_PUBLIC_ME_PLUS_API_URL");
  }

  return value.replace(/\/$/, "");
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Unable to read Supabase session: ${error.message}`);
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Health sync requires an authenticated Supabase session");
  }
  return token;
}

async function postHealthBatch(payload: HealthIngestRequest): Promise<HealthIngestResult> {
  const token = await accessToken();
  const response = await fetch(`${getApiBaseUrl()}/api/health/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function syncHealthReadings(
  readings: readonly SensorReading[],
  source: HealthIngestSource,
  cursorAfter?: string,
): Promise<HealthIngestResult> {
  return postHealthBatch({
    source,
    readings,
    ...(cursorAfter ? { cursorAfter } : {}),
  });
}

export async function syncHealthConnectRecords(
  records: readonly HealthConnectRecord[],
  windowEnd: string,
): Promise<HealthIngestResult> {
  if (records.length === 0) {
    throw new Error("No Health Connect records are available to upload.");
  }

  const source: HealthIngestSource = {
    provider: "health-connect",
    displayName: "Android Health Connect",
    metadata: { collector: "me-plus-android", ingestionVersion: 2 },
  };

  const results: HealthIngestResult[] = [];
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const batch = records.slice(offset, offset + BATCH_SIZE);
    results.push(
      await postHealthBatch({
        source,
        records: batch,
        cursorAfter: windowEnd,
      }),
    );
  }

  return {
    dataSourceId: results[0]!.dataSourceId,
    syncRunId: results.at(-1)!.syncRunId,
    recordsSeen: results.reduce((sum, result) => sum + result.recordsSeen, 0),
    recordsCreated: results.reduce((sum, result) => sum + result.recordsCreated, 0),
    recordsUpdated: results.reduce((sum, result) => sum + result.recordsUpdated, 0),
    observationIds: results.flatMap((result) => result.observationIds),
  };
}
