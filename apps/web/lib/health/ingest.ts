import type { HealthIngestRequest, HealthIngestResult, SensorReading } from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

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

async function startSyncRun(client: AdminClient, userId: string, dataSourceId: string): Promise<string> {
  const { data, error } = await client
    .from("source_sync_runs")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      status: "running",
      metadata: { ingestion: "me-plus-health-v1" },
    })
    .select("id")
    .single();

  throwIfError(error, "Unable to start health sync run");

  if (!data?.id) {
    throw new Error("Unable to resolve health sync run id");
  }

  return data.id;
}

async function updateRawEvent(
  client: AdminClient,
  rawEventId: string,
  reading: SensorReading,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client
    .from("raw_events")
    .update({
      event_type: `health-connect.${reading.metric}`,
      observed_at: reading.observedAt,
      payload: reading,
      payload_schema_version: "1",
      processing_status: "processed",
      processed_at: now,
      error_code: null,
    })
    .eq("id", rawEventId);

  throwIfError(error, `Unable to update raw health event ${reading.externalId}`);
}

async function syncRawEvent(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  reading: SensorReading,
): Promise<{ id: string; created: boolean }> {
  const existing = await client
    .from("raw_events")
    .select("id")
    .eq("data_source_id", dataSourceId)
    .eq("external_record_id", reading.externalId)
    .maybeSingle();

  throwIfError(existing.error, `Unable to look up raw health event ${reading.externalId}`);

  if (existing.data?.id) {
    await updateRawEvent(client, existing.data.id, reading);
    return { id: existing.data.id, created: false };
  }

  const now = new Date().toISOString();
  const inserted = await client
    .from("raw_events")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      external_record_id: reading.externalId,
      event_type: `health-connect.${reading.metric}`,
      observed_at: reading.observedAt,
      payload: reading,
      payload_schema_version: "1",
      processing_status: "processed",
      processed_at: now,
    })
    .select("id")
    .single();

  if (!inserted.error && inserted.data?.id) {
    return { id: inserted.data.id, created: true };
  }

  if (inserted.error && "code" in inserted.error && inserted.error.code === "23505") {
    const raced = await client
      .from("raw_events")
      .select("id")
      .eq("data_source_id", dataSourceId)
      .eq("external_record_id", reading.externalId)
      .single();

    throwIfError(raced.error, `Unable to recover concurrent raw health event ${reading.externalId}`);

    if (!raced.data?.id) {
      throw new Error(`Unable to resolve concurrent raw health event ${reading.externalId}`);
    }

    await updateRawEvent(client, raced.data.id, reading);
    return { id: raced.data.id, created: false };
  }

  throwIfError(inserted.error, `Unable to insert raw health event ${reading.externalId}`);
  throw new Error(`Unable to insert raw health event ${reading.externalId}`);
}

async function syncObservation(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  rawEventId: string,
  reading: SensorReading,
): Promise<string> {
  const lookup = await client
    .from("observations")
    .select("id")
    .eq("raw_event_id", rawEventId)
    .eq("observation_type", reading.metric)
    .order("created_at", { ascending: true });

  throwIfError(lookup.error, `Unable to look up normalized health observation ${reading.externalId}`);

  const provenance = {
    provider: reading.provenance.provider,
    sourcePackage: reading.provenance.sourcePackage,
    device: reading.provenance.device ?? null,
    recordingMethod: reading.provenance.recordingMethod ?? null,
    externalId: reading.externalId,
    lastModifiedAt: reading.lastModifiedAt,
  };

  const values = {
    user_id: userId,
    data_source_id: dataSourceId,
    raw_event_id: rawEventId,
    domain: "health",
    observation_type: reading.metric,
    observed_at: reading.observedAt,
    value_number: reading.value,
    value_text: null,
    value_boolean: null,
    value_json: null,
    unit: reading.unit,
    quality: "source",
    confidence: 1,
    provenance,
  };

  const firstExistingId = lookup.data?.[0]?.id;

  if (firstExistingId) {
    const updated = await client.from("observations").update(values).eq("id", firstExistingId);
    throwIfError(updated.error, `Unable to update normalized health observation ${reading.externalId}`);

    const duplicateIds = (lookup.data ?? []).slice(1).map((row) => row.id);
    if (duplicateIds.length > 0) {
      const removed = await client.from("observations").delete().in("id", duplicateIds);
      throwIfError(removed.error, `Unable to remove duplicate normalized observations ${reading.externalId}`);
    }

    return firstExistingId;
  }

  const inserted = await client.from("observations").insert(values).select("id").single();
  throwIfError(inserted.error, `Unable to insert normalized health observation ${reading.externalId}`);

  if (!inserted.data?.id) {
    throw new Error(`Unable to resolve normalized health observation ${reading.externalId}`);
  }

  return inserted.data.id;
}

async function markSyncRunFailed(client: AdminClient, syncRunId: string, message: string): Promise<void> {
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
  const dataSourceId = await upsertDataSource(client, userId, input);
  const syncRunId = await startSyncRun(client, userId, dataSourceId);
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const observationIds: string[] = [];

  try {
    for (const reading of input.readings) {
      const rawEvent = await syncRawEvent(client, userId, dataSourceId, reading);
      if (rawEvent.created) {
        recordsCreated += 1;
      } else {
        recordsUpdated += 1;
      }

      observationIds.push(
        await syncObservation(client, userId, dataSourceId, rawEvent.id, reading),
      );
    }

    const finishedAt = new Date().toISOString();
    const completed = await client
      .from("source_sync_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        cursor_after: input.cursorAfter ?? null,
        records_seen: input.readings.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        error_code: null,
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
      recordsCreated,
      recordsUpdated,
      observationIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";
    await markSyncRunFailed(client, syncRunId, message);
    throw error;
  }
}
