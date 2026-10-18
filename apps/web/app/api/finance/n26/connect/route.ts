import { NextResponse } from "next/server";

import { EnableBankingApiError, startN26Authorization } from "../../../../../lib/finance/enable-banking";
import { createBankConnectionState } from "../../../../../lib/finance/state";
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

    const state = createBankConnectionState(data.user.id);
    const authorization = await startN26Authorization(state);

    return NextResponse.json(
      {
        provider: "enable-banking",
        institution: "n26",
        authorizationUrl: authorization.url,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("N26 connection start failed", error);

    if (error instanceof EnableBankingApiError) {
      return NextResponse.json(
        {
          error: "n26_connection_start_failed",
          reason: "provider_rejected_request",
          providerStatus: error.status,
          providerError: error.providerError,
        },
        { status: 502 },
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("ENABLE_BANKING_PRIVATE_KEY")
    ) {
      return NextResponse.json(
        {
          error: "n26_connection_start_failed",
          reason: "invalid_private_key",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: "n26_connection_start_failed",
        reason: "server_error",
      },
      { status: 500 },
    );
  }
}
