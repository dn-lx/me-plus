import type {
  HealthConnectRawRecord,
  HealthIngestRequest,
  HealthIngestResult,
  SensorReading,
} from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type RawEventRow = {
  id: string;
  external_record_id: string | null;
};

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
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
  if (!data?.id) throw new Error("Unable to resolve health data source id");
  return data.id;
}

async function startSyncRun(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readingCount: number,
  rawRecordCount: number,
): Promise<string> {
  const { data, error } = await client
    .from("source_sync_runs")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      status: "running",
      metadata: {
        ingestion: "me-plus-health-v3-raw-plus-normalized",
        requestedReadings: readingCount,
        requestedRawRecords: rawRecordCount,
      },
    })
    .select("id")
    .single();

  throwIfError(error, "Unable to start health sync run");
  if (!data?.id) throw new Error("Unable to resolve health sync run id");
  return data.id;
}

function newest<T extends { lastModifiedAt: string; observedAt: string }>(left: T, right: T): T {
  const leftModified = Date.parse(left.lastModifiedAt);
  const rightModified = Date.parse(right.lastModifiedAt);
  if (rightModified > leftModified) return right;
  if (rightModified < leftModified) return left;
  return Date.parse(right.observedAt) >= Date.parse(left.observedAt) ? right : left;
}

function dedupeReadings(readings: readonly SensorReading[]): SensorReading[] {
  const byExternalId = new Map<string, SensorReading>();
  for (const reading of readings) {
    const prior = byExternalId.get(reading.externalId);
    byExternalId.set(reading.externalId, prior ? newest(prior, reading) : reading);
  }
  return [...byExternalId.values()];
}

function dedupeRawRecords(records: readonly HealthConnectRawRecord[]): HealthConnectRawRecord[] {
  const byExternalId = new Map<string, HealthConnectRawRecord>();
  for (const record of records) {
    const prior = byExternalId.get(record.externalId);
    byExternalId.set(record.externalId, prior ? newest(prior, record) : record);
  }
  return [...byExternalId.values()];
}

function rawRecordKey(record: HealthConnectRawRecord): string {
  return `hc-record:${record.externalId}`;
}

async function bulkSyncProviderRawRecords(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  records: readonly HealthConnectRawRecord[],
): Promise<{ recordsCreated: number; recordsUpdated: number }> {
  if (records.length === 0) return { recordsCreated: 0, recordsUpdated: 0 };

  const externalIds = records.map(rawRecordKey);
  const existing = await client
    .from("raw_events")
    .select("external_record_id")
    .eq("data_source_id", dataSourceId)
    .in("external_record_id", externalIds);

  throwIfError(existing.error, "Unable to look up existing raw Health Connect records");
  const existingIds = new Set(
    (existing.data ?? [])
      .map((row) => row.external_record_id)
      .filter((value): value is string => Boolean(value)),
  );

  const processedAt = new Date().toISOString();
  const values = records.map((record) => ({
    user_id: userId,
    data_source_id: dataSourceId,
    external_record_id: rawRecordKey(record),
    event_type: `health-connect.record.${record.recordType}`,
    observed_at: record.observedAt,
    payload: record,
    payload_schema_version: "2",
    processing_status: "processed",
    processed_at: processedAt,
    error_code: null,
  }));

  const upserted = await client
    .from("raw_events")
    .upsert(values, { onConflict: "data_source_id,external_record_id" })
    .select("id");

  throwIfError(upserted.error, "Unable to store raw Health Connect records");

  const recordsUpdated = records.filter((record) => existingIds.has(rawRecordKey(record))).length;
  return {
    recordsCreated: records.length - recordsUpdated,
    recordsUpdated,
  };
}

async function bulkSyncReadingRawEvents(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  readings: readonly SensorReading[],
): Promise<{
  rowsByExternalId: Map<string, RawEventRow>;
  recordsCreated: number;
  recordsUpdated: number;
}> {
  if (readings.length === 0) {
    return { rowsByExternalId: new Map(), recordsCreated: 0, recordsUpdated: 0 };
  }

  const externalIds = readings.map((reading) => reading.externalId);
  const existing = await client
    .from("raw_events")
    .select("id,external_record_id")
    .eq("data_source_id", dataSourceId)
    .in("external_record_id", externalIds);

  throwIfError(existing.error, "Unable to look up existing normalized-source health events");
  const existingIds = new Set(
    (existing.data ?? [])
      .map((row) => row.external_record_id)
      .filter((value): value is string => Boolean(value)),
  );

  const rows = readings.map((reading) => ({
    user_id: userId,
    data_source_id: dataSourceId,
    external_record_id: reading.externalId,
    event_type: `health-connect.${reading.metric}`,
    observed_at: reading.observedAt,
    payload: reading,
    payload_schema_version: "2",
    processing_status: "pending",
    processed_at: null,
    error_code: null,
  }));

  const upserted = await client
    .from("raw_events")
    .upsert(rows, { onConflict: "data_source_id,external_record_id" })
    .select("id,external_record_id");

  throwIfError(upserted.error, "Unable to bulk upsert health reading raw events");

  const rowsByExternalId = new Map<string, RawEventRow>();
  for (const row of upserted.data ?? []) {
    if (row.external_record_id) rowsByExternalId.set(row.external_record_id, row);
  }

  if (rowsByExternalId.size !== readings.length) {
    throw new Error(
      `Unable to resolve all health reading raw events: expected ${readings.length}, got ${rowsByExternalId.size}`,
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
  if (readings.length === 0) return [];

  const values = readings.map((reading) => {
    const rawEvent = rawEvents.get(reading.externalId);
    if (!rawEvent) throw new Error(`Missing raw event for health reading ${reading.externalId}`);

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

async function markReadingRawEventsProcessed(
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

  throwIfError(result.error, "Unable to mark health reading raw events processed");
}

async function markReadingRawEventsFailed(
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

  throwIfError(result.error, "Unable to mark health reading raw events failed");
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
  const readings = dedupeReadings(input.readings);
  const rawRecords = dedupeRawRecords(input.rawRecords ?? []);
  const dataSourceId = await upsertDataSource(client, userId, input);
  const syncRunId = await startSyncRun(
    client,
    userId,
    dataSourceId,
    readings.length,
    rawRecords.length,
  );

  let readingRawEventIds: string[] = [];
  let observationsWritten = false;

  try {
    const rawProviderResult = await bulkSyncProviderRawRecords(
      client,
      userId,
      dataSourceId,
      rawRecords,
    );

    const readingRawEvents = await bulkSyncReadingRawEvents(
      client,
      userId,
      dataSourceId,
      readings,
    );
    readingRawEventIds = [...readingRawEvents.rowsByExternalId.values()].map((row) => row.id);

    const observationIds = await bulkSyncObservations(
      client,
      userId,
      dataSourceId,
      readings,
      readingRawEvents.rowsByExternalId,
    );
    observationsWritten = true;
    await markReadingRawEventsProcessed(client, userId, dataSourceId, readingRawEventIds);

    const finishedAt = new Date().toISOString();
    const completed = await client
      .from("source_sync_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        cursor_after: input.cursorAfter ?? null,
        records_seen: readings.length + rawRecords.length,
        records_created: readingRawEvents.recordsCreated + rawProviderResult.recordsCreated,
        records_updated: readingRawEvents.recordsUpdated + rawProviderResult.recordsUpdated,
        error_code: null,
        metadata: {
          ingestion: "me-plus-health-v3-raw-plus-normalized",
          requestedReadings: input.readings.length,
          dedupedReadings: readings.length,
          requestedRawRecords: input.rawRecords?.length ?? 0,
          dedupedRawRecords: rawRecords.length,
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
      recordsCreated: readingRawEvents.recordsCreated,
      recordsUpdated: readingRawEvents.recordsUpdated,
      rawRecordsSeen: rawRecords.length,
      rawRecordsCreated: rawProviderResult.recordsCreated,
      rawRecordsUpdated: rawProviderResult.recordsUpdated,
      observationIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";

    if (readingRawEventIds.length > 0 && !observationsWritten) {
      try {
        await markReadingRawEventsFailed(client, userId, dataSourceId, readingRawEventIds, message);
      } catch (rawEventError) {
        console.error("Unable to record health reading failure state", rawEventError);
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
