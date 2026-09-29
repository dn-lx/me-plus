import { NextResponse } from "next/server";

import { ingestHealthReadings } from "../../../../lib/health/ingest";
import { parseHealthIngestRequest } from "../../../../lib/health/validate-ingest";
import { createAdminClient } from "../../../../lib/supabase/admin";

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

    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > 5_000_000) {
      return NextResponse.json(
        { error: "health_payload_too_large", detail: "Health ingestion payload exceeds 5 MB." },
        { status: 413 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText) as unknown;
    } catch {
      return NextResponse.json(
        { error: "invalid_health_payload", detail: "Health ingestion body must be valid JSON." },
        { status: 400 },
      );
    }

    const input = parseHealthIngestRequest(rawBody);

    if (
      input.source.provider === "fake-health-connect" &&
      process.env.ME_PLUS_ALLOW_FIXTURE_INGEST !== "true"
    ) {
      return NextResponse.json({ error: "fixture_ingest_disabled" }, { status: 403 });
    }

    const result = await ingestHealthReadings(data.user.id, input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_health_ingestion_error";

    if (
      message.startsWith("Health ingestion") ||
      message.startsWith("Health reading") ||
      message.startsWith("Each health reading") ||
      message.startsWith("Unsupported health metric")
    ) {
      return NextResponse.json({ error: "invalid_health_payload", detail: message }, { status: 400 });
    }

    console.error("health ingestion failed", error);
    return NextResponse.json({ error: "health_ingestion_failed" }, { status: 500 });
  }
}
