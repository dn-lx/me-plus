import type { HealthIngestRequest, HealthIngestResult, SensorReading } from "@me-plus/contracts";

type BatchParameters = {
  p_user_id: string;
  p_input: HealthIngestRequest;
  p_revisions: Array<{ reading: SensorReading; revisionKey: string }>;
};

export async function ingestAtomicBatch(
  userId: string,
  input: HealthIngestRequest,
  revisionKey: (reading: SensorReading) => string,
  call: (parameters: BatchParameters) => PromiseLike<{ data: unknown; error: { code?: string } | null }>,
): Promise<HealthIngestResult> {
  const { data, error } = await call({
    p_user_id: userId,
    p_input: input,
    // Preserve every provider revision; canonical dedupe occurs inside the DB.
    p_revisions: input.readings.map((reading) => ({ reading, revisionKey: revisionKey(reading) })),
  });
  if (error) throw new Error(`Unable to ingest health batch: ${error.code ?? "database_error"}`);
  if (!data || typeof data !== "object" || "error" in data) {
    throw new Error("Unable to ingest health batch atomically; attempt recorded for retry");
  }
  return data as HealthIngestResult;
}
