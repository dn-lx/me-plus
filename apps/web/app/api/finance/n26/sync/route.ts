import { NextResponse } from "next/server";

import { getEnableBankingSession } from "../../../../../lib/finance/enable-banking";
import { syncN26Session } from "../../../../../lib/finance/n26-ingest";
import { createAdminClient } from "../../../../../lib/supabase/admin";

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "missing_bearer_token" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });
    }

    const source = await admin
      .from("data_sources")
      .select("external_account_ref")
      .eq("user_id", data.user.id)
      .eq("provider", "enable-banking")
      .eq("display_name", "N26")
      .eq("status", "active")
      .maybeSingle();

    if (source.error) {
      throw new Error(`Unable to load N26 data source: ${source.error.message}`);
    }

    if (!source.data?.external_account_ref) {
      return NextResponse.json({ error: "n26_not_connected" }, { status: 404 });
    }

    const session = await getEnableBankingSession(
      source.data.external_account_ref,
    );
    const result = await syncN26Session(data.user.id, session);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("N26 sync failed", error);
    return NextResponse.json({ error: "n26_sync_failed" }, { status: 500 });
  }
}
