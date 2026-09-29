import type { HealthIngestRequest, HealthIngestResult, SensorReading } from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";
import {
  compareProviderRevision,
  dedupeReadingsByFreshness,
  providerRevisionKey,
} from "./freshness";

type AdminClient = ReturnType<typeof createAdminClient>;

type RawEventRow = {
  id: string;
  external_record_id: string | null;
  payload: unknown;
};

type ExistingObservationRow = {
  raw_event_id: string | null;
  value_number: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
  unit: string | null;
  quality: string | null;
  confidence: number | null;
  provenance: unknown;
};

function userCorrectedFields(metadata: unknown): ReadonlySet<string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return new Set();
  }

  const value = (metadata as Record<string, unknown>).userCorrectedFields;
  if (!Array.isArray(value)) {
    return new Set();
  }

  return new Set(
    value.filter((field): field is string => typeof field === "string" && field.length > 0),
  );
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function storedSensorReading(payload: unknown): SensorReading | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Partial<SensorReading>;
  if (
    typeof value.externalId !== "string" ||
    typeof value.metric !== "string" ||
    typeof value.value !== "number" ||
    typeof value.unit !== "string" ||
    typeof value.observedAt !== "string" ||
    typeof value.lastModifiedAt !== "string" ||
    !value.provenance ||
    typeof value.provenance !== "object"
  ) {
    return null;
  }

  return value as SensorReading;
}

async function upsertDataSource(
  client: AdminClient,
  userId: string,
  input: HealthIngestRequest,
): Promise<string> {
  const { data, error } = await client
    .from("data_sources")
    .upsert(
      {
        user_id: userId,
        kind: "health_sensor",
        provider: input.source.provider,
        display_name: input.source.displayName,
        status: "active",
        external_account_ref: input.source.externalAccountRef ?? null,
        metadata: input.source.metadata ?? {},
      },
      { onConflict: "user_id,provider,display_name" },
    )
    .select("id")
    .single();

  throwIfError(error, "Unable to upsert health data source");

  if (!data?.id) {
    throw new Error("Unable to resolve health data source id");
  }

  return data.id;
}

async function startSyncRun(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readingCount: number,
): Promise<string> {
  const { data, error } = await client
    .from("source_sync_runs")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      status: "running",
      metadata: {
        ingestion: "me-plus-health-v3-freshness",
        requestedReadings: readingCount,
      },
    })
    .select("id")
    .single();

  throwIfError(error, "Unable to start health sync run");

  if (!data?.id) {
    throw new Error("Unable to resolve health sync run id");
  }

  return data.id;
}

async function storeRawEventRevisions(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
): Promise<void> {
  if (readings.length === 0) return;

  const uniqueRevisions = new Map<string, SensorReading>();
  for (const reading of readings) {
    uniqueRevisions.set(
      `${reading.externalId}\u0000${providerRevisionKey(reading)}`,
      reading,
    );
  }

  const rows = [...uniqueRevisions.values()].map((reading) => ({
    user_id: userId,
    data_source_id: dataSourceId,
    external_record_id: reading.externalId,
    provider_last_modified_at: reading.lastModifiedAt,
    observed_at: reading.observedAt,
    revision_key: providerRevisionKey(reading),
    payload: reading,
  }));

  const result = await client
    .from("raw_event_revisions")
    .upsert(rows, {
      onConflict: "data_source_id,external_record_id,revision_key",
      ignoreDuplicates: true,
    });

  throwIfError(result.error, "Unable to preserve raw health event revisions");
}

async function bulkSyncRawEvents(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
): Promise<{
  rowsByExternalId: Map<string, RawEventRow>;
  acceptedReadings: SensorReading[];
  recordsCreated: number;
  recordsUpdated: number;
  recordsIgnoredStale: number;
}> {
  const externalIds = readings.map((reading) => reading.externalId);
  const existing = await client
    .from("raw_events")
    .select("id,external_record_id,payload")
    .eq("data_source_id", dataSourceId)
    .in("external_record_id", externalIds);

  throwIfError(existing.error, "Unable to look up existing raw health events");

  const existingByExternalId = new Map<string, RawEventRow>();
  for (const row of (existing.data ?? []) as RawEventRow[]) {
    if (row.external_record_id) {
      existingByExternalId.set(row.external_record_id, row);
    }
  }

  const acceptedReadings: SensorReading[] = [];
  const rowsByExternalId = new Map(existingByExternalId);
  const rows: Array<Record<string, unknown>> = [];
  let recordsCreated = 0;
  let recordsUpdated = 0;

  for (const reading of readings) {
    const current = existingByExternalId.get(reading.externalId);
    const currentReading = current ? storedSensorReading(current.payload) : null;

    if (currentReading && compareProviderRevision(reading, currentReading) <= 0) {
      continue;
    }

    acceptedReadings.push(reading);
    if (current) {
      recordsUpdated += 1;
    } else {
      recordsCreated += 1;
    }

    rows.push({
      user_id: userId,
      data_source_id: dataSourceId,
      external_record_id: reading.externalId,
      event_type: `health-connect.${reading.metric}`,
      observed_at: reading.observedAt,
      payload: reading,
      payload_schema_version: "1",
      processing_status: "pending",
      processed_at: null,
      error_code: null,
    });
  }

  if (rows.length > 0) {
    const upserted = await client
      .from("raw_events")
      .upsert(rows, { onConflict: "data_source_id,external_record_id" })
      .select("id,external_record_id,payload");

    throwIfError(upserted.error, "Unable to bulk upsert raw health events");

    for (const row of (upserted.data ?? []) as RawEventRow[]) {
      if (row.external_record_id) {
        rowsByExternalId.set(row.external_record_id, row);
      }
    }
  }

  for (const reading of acceptedReadings) {
    if (!rowsByExternalId.has(reading.externalId)) {
      throw new Error(`Unable to resolve bulk raw health event ${reading.externalId}`);
    }
  }

  return {
    rowsByExternalId,
    acceptedReadings,
    recordsCreated,
    recordsUpdated,
    recordsIgnoredStale: readings.length - acceptedReadings.length,
  };
}

async function bulkSyncObservations(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
  rawEvents: Map<string, RawEventRow>,
): Promise<string[]> {
  if (readings.length === 0) return [];

  const rawEventIds = readings.map((reading) => rawEvents.get(reading.externalId)?.id);
  if (rawEventIds.some((id) => !id)) {
    throw new Error("Missing canonical raw event for one or more health readings");
  }

  const existing = await client
    .from("observations")
    .select(
      "raw_event_id,value_number,value_text,value_boolean,value_json,unit,quality,confidence,provenance",
    )
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .in("raw_event_id", rawEventIds as string[]);

  throwIfError(existing.error, "Unable to look up existing normalized health observations");

  const existingByRawEventId = new Map<string, ExistingObservationRow>();
  for (const row of (existing.data ?? []) as ExistingObservationRow[]) {
    if (row.raw_event_id) {
      existingByRawEventId.set(row.raw_event_id, row);
    }
  }

  const values = readings.map((reading) => {
    const rawEvent = rawEvents.get(reading.externalId);
    if (!rawEvent) {
      throw new Error(`Missing raw event for health reading ${reading.externalId}`);
    }

    const current = existingByRawEventId.get(rawEvent.id);
    const currentProvenance =
      current?.provenance &&
      typeof current.provenance === "object" &&
      !Array.isArray(current.provenance)
        ? (current.provenance as Record<string, unknown>)
        : {};
    const correctedFields = userCorrectedFields(currentProvenance);
    const correctedValue = [
      "value_number",
      "value_text",
      "value_boolean",
      "value_json",
    ].some((field) => correctedFields.has(field));

    return {
      user_id: userId,
      data_source_id: dataSourceId,
      raw_event_id: rawEvent.id,
      domain: "health",
      observation_type: reading.metric,
      observed_at: reading.observedAt,
      value_number: correctedValue ? current?.value_number ?? null : reading.value,
      value_text: correctedValue ? current?.value_text ?? null : null,
      value_boolean: correctedValue ? current?.value_boolean ?? null : null,
      value_json: correctedValue
        ? current?.value_json ?? null
        : reading.sourcePayload ?? null,
      unit: correctedFields.has("unit") ? current?.unit ?? null : reading.unit,
      quality: correctedFields.has("quality")
        ? current?.quality ?? null
        : "source",
      confidence: correctedFields.has("confidence")
        ? current?.confidence ?? null
        : 1,
      provenance: {
        ...currentProvenance,
        provider: reading.provenance.provider,
        sourcePackage: reading.provenance.sourcePackage,
        device: reading.provenance.device ?? null,
        recordingMethod: reading.provenance.recordingMethod ?? null,
        externalId: reading.externalId,
        lastModifiedAt: reading.lastModifiedAt,
        providerRevisionKey: providerRevisionKey(reading),
      },
    };
  });

  const result = await client
    .from("observations")
    .upsert(values, { onConflict: "raw_event_id,observation_type" })
    .select("id");

  throwIfError(result.error, "Unable to bulk upsert normalized health observations");

  return (result.data ?? []).map((row) => row.id);
}

async function markRawEventsProcessed(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  rawEventIds: readonly string[],
): Promise<void> {
  if (rawEventIds.length === 0) return;

  const result = await client
    .from("raw_events")
    .update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      error_code: null,
    })
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .in("id", [...rawEventIds]);

  throwIfError(result.error, "Unable to mark raw health events processed");
}

async function markRawEventsFailed(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  rawEventIds: readonly string[],
  message: string,
): Promise<void> {
  if (rawEventIds.length === 0) return;

  const result = await client
    .from("raw_events")
    .update({
      processing_status: "failed",
      processed_at: new Date().toISOString(),
      error_code: message.slice(0, 200),
    })
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .in("id", [...rawEventIds]);

  throwIfError(result.error, "Unable to mark raw health events failed");
}

async function markSyncRunFailed(
  client: AdminClient,
  syncRunId: string,
  message: string,
): Promise<void> {
  const result = await client
    .from("source_sync_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: message.slice(0, 200),
    })
    .eq("id", syncRunId);

  throwIfError(result.error, "Unable to mark health sync run failed");
}

export async function ingestHealthReadings(
  userId: string,
  input: HealthIngestRequest,
): Promise<HealthIngestResult> {
  const client = createAdminClient();
  const readings = dedupeReadingsByFreshness(input.readings);
  const dataSourceId = await upsertDataSource(client, userId, input);
  const syncRunId = await startSyncRun(client, userId, dataSourceId, input.readings.length);
  let rawEventIds: string[] = [];
  let observationsWritten = false;

  try {
    await storeRawEventRevisions(client, userId, dataSourceId, input.readings);

    const rawEvents = await bulkSyncRawEvents(client, userId, dataSourceId, readings);
    rawEventIds = rawEvents.acceptedReadings
      .map((reading) => rawEvents.rowsByExternalId.get(reading.externalId)?.id)
      .filter((id): id is string => Boolean(id));

    const observationIds = await bulkSyncObservations(
      client,
      userId,
      dataSourceId,
      rawEvents.acceptedReadings,
      rawEvents.rowsByExternalId,
    );
    observationsWritten = true;

    await markRawEventsProcessed(client, userId, dataSourceId, rawEventIds);

    const finishedAt = new Date().toISOString();
    const completed = await client
      .from("source_sync_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        cursor_after: input.cursorAfter ?? null,
        records_seen: input.readings.length,
        records_created: rawEvents.recordsCreated,
        records_updated: rawEvents.recordsUpdated,
        error_code: null,
        metadata: {
          ingestion: "me-plus-health-v3-freshness",
          requestedReadings: input.readings.length,
          dedupedReadings: readings.length,
          acceptedReadings: rawEvents.acceptedReadings.length,
          staleReadingsIgnored: rawEvents.recordsIgnoredStale,
        },
      })
      .eq("id", syncRunId);

    throwIfError(completed.error, "Unable to finish health sync run");

    const sourceUpdated = await client
      .from("data_sources")
      .update({ last_sync_at: finishedAt })
      .eq("id", dataSourceId);

    throwIfError(sourceUpdated.error, "Unable to update health data source sync timestamp");

    return {
      dataSourceId,
      syncRunId,
      recordsSeen: input.readings.length,
      recordsCreated: rawEvents.recordsCreated,
      recordsUpdated: rawEvents.recordsUpdated,
      observationIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";

    if (rawEventIds.length > 0 && !observationsWritten) {
      try {
        await markRawEventsFailed(client, userId, dataSourceId, rawEventIds, message);
      } catch (rawEventError) {
        console.error("Unable to record raw health event failure state", rawEventError);
      }
    }

    try {
      await markSyncRunFailed(client, syncRunId, message);
    } catch (syncRunError) {
      console.error("Unable to record failed health sync run", syncRunError);
    }

    throw error;
  }
}
