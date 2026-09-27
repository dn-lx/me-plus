import { NextResponse } from "next/server";

import { authorizeEnableBankingSession } from "../../../../../lib/finance/enable-banking";
import { syncN26Session } from "../../../../../lib/finance/n26-ingest";
import { verifyBankConnectionState } from "../../../../../lib/finance/state";

function homeRedirect(request: Request, status: string, params: Record<string, string> = {}) {
  const url = new URL("/", request.url);
  url.searchParams.set("n26", status);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return homeRedirect(request, "cancelled");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return homeRedirect(request, "error", { reason: "invalid_callback" });
  }

  try {
    const connectionState = verifyBankConnectionState(state);
    const session = await authorizeEnableBankingSession(code);
    const result = await syncN26Session(connectionState.userId, session);

    return homeRedirect(request, "connected", {
      accounts: String(result.accountsSeen),
      transactions: String(result.transactionsSeen),
    });
  } catch (error) {
    console.error("N26 connection callback failed", error);
    return homeRedirect(request, "error", { reason: "connection_failed" });
  }
}
