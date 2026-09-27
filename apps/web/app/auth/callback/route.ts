import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const destination = new URL(
    "/finance/connect",
    process.env.ENABLE_BANKING_REDIRECT_URL || request.url,
  );
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    destination.searchParams.set("auth", "error");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    destination.searchParams.set("auth", "error");
  }

  return NextResponse.redirect(destination);
}
