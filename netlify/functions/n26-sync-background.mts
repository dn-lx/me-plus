import { timingSafeEqual } from "node:crypto";

import { getEnableBankingSession } from "../../apps/web/lib/finance/enable-banking";
import { syncN26Session } from "../../apps/web/lib/finance/n26-ingest";
import { createAdminClient } from "../../apps/web/lib/supabase/admin";

const SCHEDULER_KEY = "n26_provider_sync";
const AUTOMATION_ID = "netlify:n26-provider-refresh";
const CADENCE_MINUTES = 360;
const ALLOWED_LATENESS_MINUTES = 60;

function schedulerSecret(): string {
  const secret = Netlify.env.get("N26_SYNC_SCHEDULER_SECRET");
  if (!secret) {
    throw new Error("Missing N26_SYNC_SCHEDULER_SECRET");
  }
  return secret;
}

function authorized(request: Request): boolean {
  const expected = schedulerSecret();
  const actual = request.headers.get("x-me-plus-scheduler-secret");

  if (!actual) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(actual);

  return left.length === right.length && timingSafeEqual(left, right);
}

async function recordHeartbeat(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  status: "invoked" | "completed" | "failed",
  error: Record<string, unknown> | null = null,
) {
  const result = await admin.rpc("record_scheduler_heartbeat", {
    p_user_id: userId,
    p_scheduler_key: SCHEDULER_KEY,
    p_status: status,
    p_policy_version: null,
    p_error: error,
    p_expected_cadence_minutes: CADENCE_MINUTES,
    p_allowed_lateness_minutes: ALLOWED_LATENESS_MINUTES,
    p_run_id: null,
    p_automation_id: AUTOMATION_ID,
  });

  if (result.error) {
    throw new Error(`Unable to record N26 scheduler heartbeat: ${result.error.message}`);
  }
}

async function ensureFailureRun(
  admin: ReturnType<typeof createAdminClient>,
  source: { id: string; user_id: string },
  refreshStartedAt: string,
  message: string,
) {
  const recentRun = await admin
    .from("source_sync_runs")
    .select("id")
    .eq("user_id", source.user_id)
    .eq("data_source_id", source.id)
    .gte("started_at", refreshStartedAt)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentRun.error) {
    console.error("Unable to inspect recent N26 sync runs", recentRun.error);
    return;
  }

  if (recentRun.data?.id) {
    return;
  }

  const inserted = await admin.from("source_sync_runs").insert({
    user_id: source.user_id,
    data_source_id: source.id,
    status: "failed",
    started_at: refreshStartedAt,
    finished_at: new Date().toISOString(),
    error_code: message.slice(0, 200),
    metadata: {
      ingestion: "me-plus-finance-v1",
      provider: "enable-banking",
      institution: "n26",
      trigger: "netlify-recurring-provider-sync",
      failureStage: "provider_session_or_sync_start",
    },
  });

  if (inserted.error) {
    console.error("Unable to persist pre-ingestion N26 failure", inserted.error);
  }
}

export default async function handler(request: Request) {
  if (!authorized(request)) {
    console.error("Rejected unauthorized N26 background sync invocation");
    return;
  }

  const admin = createAdminClient();
  const { data: sources, error } = await admin
    .from("data_sources")
    .select("id,user_id,external_account_ref")
    .eq("provider", "enable-banking")
    .eq("display_name", "N26")
    .eq("status", "active");

  if (error) {
    throw new Error(`Unable to load active N26 sources: ${error.message}`);
  }

  for (const source of sources ?? []) {
    const refreshStartedAt = new Date().toISOString();

    await recordHeartbeat(admin, source.user_id, "invoked");

    if (!source.external_account_ref) {
      const heartbeatError = {
        error_type: "n26_provider_session_missing",
        data_source_id: source.id,
      };

      await ensureFailureRun(
        admin,
        source,
        refreshStartedAt,
        "n26_provider_session_missing",
      );
      await recordHeartbeat(admin, source.user_id, "failed", heartbeatError);
      continue;
    }

    try {
      const session = await getEnableBankingSession(source.external_account_ref);
      const result = await syncN26Session(source.user_id, session);

      await recordHeartbeat(admin, source.user_id, "completed");

      console.log("Recurring N26 sync completed", {
        sourceId: source.id,
        syncRunId: result.syncRunId,
        accountsSeen: result.accountsSeen,
        transactionsSeen: result.transactionsSeen,
        recordsCreated: result.recordsCreated,
        recordsUpdated: result.recordsUpdated,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown_n26_recurring_sync_error";

      await ensureFailureRun(admin, source, refreshStartedAt, message);
      await recordHeartbeat(admin, source.user_id, "failed", {
        error_type: "n26_provider_sync_failed",
        data_source_id: source.id,
        message: message.slice(0, 200),
      });

      console.error("Recurring N26 sync failed", {
        sourceId: source.id,
        error: message,
      });
    }
  }
}
