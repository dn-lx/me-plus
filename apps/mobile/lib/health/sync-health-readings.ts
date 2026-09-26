import type {
  HealthIngestRequest,
  HealthIngestResult,
  HealthIngestSource,
  SensorReading,
} from "@me-plus/contracts";

import { createClient } from "../supabase/client";

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
  const supabase = createClient();
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
