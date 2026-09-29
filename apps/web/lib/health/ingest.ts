import type { HealthIngestRequest, HealthIngestResult } from "@me-plus/contracts";
import { createAdminClient } from "../supabase/admin";
import { providerRevisionKey } from "./freshness";
import { ingestAtomicBatch } from "./ingest-batch";

// Authentication and validation occur at the API boundary. Health writes,
// freshness and correction checks share one source-serialized DB transaction.
export async function ingestHealthReadings(
  userId: string,
  input: HealthIngestRequest,
): Promise<HealthIngestResult> {
  const client = createAdminClient();
  return ingestAtomicBatch(userId, input, providerRevisionKey,
    (parameters) => client.rpc("server_ingest_health_batch", parameters));
}
