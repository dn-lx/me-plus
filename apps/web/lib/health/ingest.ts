import type {
  HealthConnectRecord,
  HealthIngestRequest,
  HealthIngestResult,
  SensorReading,
} from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type HealthItem = SensorReading | HealthConnectRecord;

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function isReading(item: HealthItem): item is SensorReading {
  return "metric" in item;
}

function observationType(item: HealthItem): string {
  return isReading(item)
    ? item.metric
    : item.recordType.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function rawPayload(item: HealthItem): Record<string, unknown> {
  return isReading(item)
    ? { ...item, sourcePayload: item.sourcePayload ?? null }
    : { ...item, payload: item.payload };
}

async function upsertDataSource(client: AdminClient, userId: string, input: HealthIngestRequest): Promise<string> {
  const { data, error } = await client.from("data_sources").upsert(
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
  ).select("id").single();

  throwIfError(error, "Unable to upsert health data source");
  if (!data?.id) throw new Error("Unable to resolve health data source id");
  return data.id;
}

async function startSyncRun(client: AdminClient, userId: string, dataSourceId: string): Promise<string> {
  const { data, error } = await client.from("source_sync_runs").insert({
    user_id: userId,
    data_source_id: dataSourceId,
    status: "running",
    metadata: { ingestion: "me-plus-health-v2", transport: "authenticated-mobile-api" },
  }).select("id").single();

  throwIfError(error, "Unable to start health sync run");
  if (!data?.id) throw new Error("Unable to resolve health sync run id");
  return data.id;
}

async function writeRawEvent(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  item: HealthItem,
): Promise<{ id: string; created: boolean }> {
  const existing = await client.from("raw_events").select("id")
    .eq("data_source_id", dataSourceId)
    .eq("external_record_id", item.externalId)
    .maybeSingle();
  throwIfError(existing.error, `Unable to look up raw health event ${item.externalId}`);

  const now = new Date().toISOString();
  const values = {
    user_id: userId,
    data_source_id: dataSourceId,
    external_record_id: item.externalId,
    event_type: `health-connect.${observationType(item)}`,
    observed_at: item.observedAt,
    payload: rawPayload(item),
    payload_schema_version: "2",
    processing_status: "processed",
    processed_at: now,
    error_code: null,
  };

  if (existing.data?.id) {
    const updated = await client.from("raw_events").update(values).eq("id", existing.data.id);
    throwIfError(updated.error, `Unable to update raw health event ${item.externalId}`);
    return { id: existing.data.id, created: false };
  }

  const inserted = await client.from("raw_events").insert(values).select("id").single();
  if (!inserted.error && inserted.data?.id) return { id: inserted.data.id, created: true };

  if (inserted.error && "code" in inserted.error && inserted.error.code === "23505") {
    const raced = await client.from("raw_events").select("id")
      .eq("data_source_id", dataSourceId)
      .eq("external_record_id", item.externalId)
      .single();
    throwIfError(raced.error, `Unable to recover concurrent raw health event ${item.externalId}`);
    if (!raced.data?.id) throw new Error(`Unable to resolve raw health event ${item.externalId}`);
    const updated = await client.from("raw_events").update(values).eq("id", raced.data.id);
    throwIfError(updated.error, `Unable to update concurrent raw health event ${item.externalId}`);
    return { id: raced.data.id, created: false };
  }

  throwIfError(inserted.error, `Unable to insert raw health event ${item.externalId}`);
  throw new Error(`Unable to insert raw health event ${item.externalId}`);
}

async function syncObservation(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  rawEventId: string,
  item: HealthItem,
): Promise<string> {
  const type = observationType(item);
  const lookup = await client.from("observations").select("id")
    .eq("raw_event_id", rawEventId)
    .eq("observation_type", type)
    .order("created_at", { ascending: true });
  throwIfError(lookup.error, `Unable to look up normalized health observation ${item.externalId}`);

  const provenance = {
    provider: item.provenance.provider,
    sourcePackage: item.provenance.sourcePackage,
    device: item.provenance.device ?? null,
    recordingMethod: item.provenance.recordingMethod ?? null,
    externalId: item.externalId,
    lastModifiedAt: item.lastModifiedAt,
    ...(isReading(item) ? {} : { healthConnectRecordType: item.recordType }),
  };

  const values = {
    user_id: userId,
    data_source_id: dataSourceId,
    raw_event_id: rawEventId,
    domain: "health",
    observation_type: type,
    observed_at: item.observedAt,
    value_number: isReading(item) ? item.value : null,
    value_text: null,
    value_boolean: null,
    value_json: isReading(item) ? (item.sourcePayload ?? null) : item.payload,
    unit: isReading(item) ? item.unit : null,
    quality: "source",
    confidence: 1,
    provenance,
  };

  const firstExistingId = lookup.data?.[0]?.id;
  if (firstExistingId) {
    const updated = await client.from("observations").update(values).eq("id", firstExistingId);
    throwIfError(updated.error, `Unable to update normalized health observation ${item.externalId}`);
    const duplicateIds = (lookup.data ?? []).slice(1).map((row) => row.id);
    if (duplicateIds.length) {
      const removed = await client.from("observations").delete().in("id", duplicateIds);
      throwIfError(removed.error, `Unable to remove duplicate health observations ${item.externalId}`);
    }
    return firstExistingId;
  }

  const inserted = await client.from("observations").insert(values).select("id").single();
  throwIfError(inserted.error, `Unable to insert normalized health observation ${item.externalId}`);
  if (!inserted.data?.id) throw new Error(`Unable to resolve health observation ${item.externalId}`);
  return inserted.data.id;
}

async function markSyncRunFailed(client: AdminClient, syncRunId: string, message: string): Promise<void> {
  await client.from("source_sync_runs").update({
    status: "failed",
    finished_at: new Date().toISOString(),
    error_code: message.slice(0, 200),
  }).eq("id", syncRunId);
}

export async function ingestHealthReadings(userId: string, input: HealthIngestRequest): Promise<HealthIngestResult> {
  const client = createAdminClient();
  const dataSourceId = await upsertDataSource(client, userId, input);
  const syncRunId = await startSyncRun(client, userId, dataSourceId);
  const items: readonly HealthItem[] = input.records ?? input.readings ?? [];
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const observationIds: string[] = [];

  try {
    for (const item of items) {
      const rawEvent = await writeRawEvent(client, userId, dataSourceId, item);
      rawEvent.created ? recordsCreated += 1 : recordsUpdated += 1;
      observationIds.push(await syncObservation(client, userId, dataSourceId, rawEvent.id, item));
    }

    const finishedAt = new Date().toISOString();
    const completed = await client.from("source_sync_runs").update({
      status: "completed",
      finished_at: finishedAt,
      cursor_after: input.cursorAfter ?? null,
      records_seen: items.length,
      records_created: recordsCreated,
      records_updated: recordsUpdated,
      error_code: null,
    }).eq("id", syncRunId);
    throwIfError(completed.error, "Unable to finish health sync run");

    const sourceUpdated = await client.from("data_sources").update({ last_sync_at: finishedAt }).eq("id", dataSourceId);
    throwIfError(sourceUpdated.error, "Unable to update health data source sync timestamp");

    return { dataSourceId, syncRunId, recordsSeen: items.length, recordsCreated, recordsUpdated, observationIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";
    await markSyncRunFailed(client, syncRunId, message);
    throw error;
  }
}
