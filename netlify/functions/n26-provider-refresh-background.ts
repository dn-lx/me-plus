import { timingSafeEqual } from "node:crypto";

import { getEnableBankingSession } from "../../apps/web/lib/finance/enable-banking";
import { syncN26Session } from "../../apps/web/lib/finance/n26-ingest";
import { createAdminClient } from "../../apps/web/lib/supabase/admin";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function authorized(request: Request): boolean {
  const expected = Netlify.env.get("MEPLUS_SCHEDULER_INTERNAL_TOKEN");
  const actual = request.headers.get("x-meplus-scheduler-token");

  if (!expected || !actual) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async (request: Request) => {
  if (!authorized(request)) {
    console.error("Rejected unauthorized scheduled N26 refresh");
    return;
  }

  const admin = createAdminClient();
  const sources = await admin
    .from("data_sources")
    .select("id,user_id,external_account_ref")
    .eq("provider", "enable-banking")
    .eq("display_name", "N26")
    .eq("status", "active");

  if (sources.error) {
    throw new Error(`Unable to load active N26 sources: ${sources.error.message}`);
  }

  for (const source of sources.data ?? []) {
    if (!source.external_account_ref) {
      console.error("Skipping N26 source without a provider session", source.id);
      continue;
    }

    const refreshStartedAt = new Date().toISOString();

    try {
      const session = await getEnableBankingSession(source.external_account_ref);
      await syncN26Session(source.user_id, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // syncN26Session records its own failure once a sync run has started.
      // If the provider session request failed before that point, create a
      // bounded failed run so the daily bank health check can see the failure
      // immediately instead of waiting for freshness to exceed 36 hours.
      const recentRun = await admin
        .from("source_sync_runs")
        .select("id")
        .eq("user_id", source.user_id)
        .eq("data_source_id", source.id)
        .gte("started_at", refreshStartedAt)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!recentRun.error && !recentRun.data?.id) {
        await admin.from("source_sync_runs").insert({
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
            trigger: "netlify-scheduled-background",
            failureStage: "provider_session_or_sync_start",
          },
        });
      }

      console.error("Scheduled N26 refresh failed", {
        dataSourceId: source.id,
        userId: source.user_id,
        error: message,
      });
    }
  }
};
