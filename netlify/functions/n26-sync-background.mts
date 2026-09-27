import { getEnableBankingSession } from "../../apps/web/lib/finance/enable-banking";
import { syncN26Session } from "../../apps/web/lib/finance/n26-ingest";
import { createAdminClient } from "../../apps/web/lib/supabase/admin";

function schedulerSecret(): string {
  const secret = Netlify.env.get("N26_SYNC_SCHEDULER_SECRET");
  if (!secret) throw new Error("Missing N26_SYNC_SCHEDULER_SECRET");
  return secret;
}

export default async function handler(request: Request) {
  if (request.headers.get("x-me-plus-scheduler-secret") !== schedulerSecret()) {
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
    if (!source.external_account_ref) continue;

    try {
      const session = await getEnableBankingSession(source.external_account_ref);
      await syncN26Session(source.user_id, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_n26_daily_sync_error";
      console.error("Daily N26 sync failed", { sourceId: source.id, error: message });

      await admin
        .from("data_sources")
        .update({
          status: "error",
          metadata: {
            dailySyncFailure: {
              occurredAt: new Date().toISOString(),
              errorCode: message.slice(0, 200),
            },
          },
        })
        .eq("id", source.id);
    }
  }
}
