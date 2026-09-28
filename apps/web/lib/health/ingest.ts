import type { HealthIngestRequest, HealthIngestResult, SensorReading } from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type RawEventRow = {
  id: string;
  external_record_id: string | null;
};

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
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
        ingestion: "me-plus-health-v2-bulk",
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

function dedupeReadings(readings: readonly SensorReading[]): SensorReading[] {
  const byExternalId = new Map<string, SensorReading>();
  for (const reading of readings) {
    byExternalId.set(reading.externalId, reading);
  }
  return [...byExternalId.values()];
}

async function bulkSyncRawEvents(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
): Promise<{
  rowsByExternalId: Map<string, RawEventRow>;
  recordsCreated: number;
  recordsUpdated: number;
}> {
  const externalIds = readings.map((reading) => reading.externalId);
  const existing = await client
    .from("raw_events")
    .select("id,external_record_id")
    .eq("data_source_id", dataSourceId)
    .in("external_record_id", externalIds);

  throwIfError(existing.error, "Unable to look up existing raw health events");

  const existingIds = new Set(
    (existing.data ?? [])
      .map((row) => row.external_record_id)
      .filter((value): value is string => Boolean(value)),
  );

  const processedAt = new Date().toISOString();
  const rows = readings.map((reading) => ({
    user_id: userId,
    data_source_id: dataSourceId,
    external_record_id: reading.externalId,
    event_type: `health-connect.${reading.metric}`,
    observed_at: reading.observedAt,
    payload: reading,
    payload_schema_version: "1",
    processing_status: "processed",
    processed_at: processedAt,
    error_code: null,
  }));

  const upserted = await client
    .from("raw_events")
    .upsert(rows, { onConflict: "data_source_id,external_record_id" })
    .select("id,external_record_id");

  throwIfError(upserted.error, "Unable to bulk upsert raw health events");

  const rowsByExternalId = new Map<string, RawEventRow>();
  for (const row of upserted.data ?? []) {
    if (row.external_record_id) {
      rowsByExternalId.set(row.external_record_id, row);
    }
  }

  if (rowsByExternalId.size !== readings.length) {
    throw new Error(
      `Unable to resolve all bulk raw health events: expected ${readings.length}, got ${rowsByExternalId.size}`,
    );
  }

  const recordsUpdated = readings.filter((reading) => existingIds.has(reading.externalId)).length;
  return {
    rowsByExternalId,
    recordsCreated: readings.length - recordsUpdated,
    recordsUpdated,
  };
}

async function bulkSyncObservations(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
  rawEvents: Map<string, RawEventRow>,
): Promise<string[]> {
  const values = readings.map((reading) => {
    const rawEvent = rawEvents.get(reading.externalId);
    if (!rawEvent) {
      throw new Error(`Missing raw event for health reading ${reading.externalId}`);
    }

    return {
      user_id: userId,
      data_source_id: dataSourceId,
      raw_event_id: rawEvent.id,
      domain: "health",
      observation_type: reading.metric,
      observed_at: reading.observedAt,
      value_number: reading.value,
      value_text: null,
      value_boolean: null,
      value_json: reading.sourcePayload ?? null,
      unit: reading.unit,
      quality: "source",
      confidence: 1,
      provenance: {
        provider: reading.provenance.provider,
        sourcePackage: reading.provenance.sourcePackage,
        device: reading.provenance.device ?? null,
        recordingMethod: reading.provenance.recordingMethod ?? null,
        externalId: reading.externalId,
        lastModifiedAt: reading.lastModifiedAt,
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

async function markSyncRunFailed(
  client: AdminClient,
  syncRunId: string,
  message: string,
): Promise<void> {
  await client
    .from("source_sync_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: message.slice(0, 200),
    })
    .eq("id", syncRunId);
}

export async function ingestHealthReadings(
  userId: string,
  input: HealthIngestRequest,
): Promise<HealthIngestResult> {
  const client = createAdminClient();
  const readings = dedupeReadings(input.readings);
  const dataSourceId = await upsertDataSource(client, userId, input);
  const syncRunId = await startSyncRun(client, userId, dataSourceId, readings.length);

  try {
    const rawEvents = await bulkSyncRawEvents(client, userId, dataSourceId, readings);
    const observationIds = await bulkSyncObservations(
      client,
      userId,
      dataSourceId,
      readings,
      rawEvents.rowsByExternalId,
    );

    const finishedAt = new Date().toISOString();
    const completed = await client
      .from("source_sync_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        cursor_after: input.cursorAfter ?? null,
        records_seen: readings.length,
        records_created: rawEvents.recordsCreated,
        records_updated: rawEvents.recordsUpdated,
        error_code: null,
        metadata: {
          ingestion: "me-plus-health-v2-bulk",
          requestedReadings: input.readings.length,
          dedupedReadings: readings.length,
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
      recordsSeen: readings.length,
      recordsCreated: rawEvents.recordsCreated,
      recordsUpdated: rawEvents.recordsUpdated,
      observationIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";
    await markSyncRunFailed(client, syncRunId, message);
    throw error;
  }
}
