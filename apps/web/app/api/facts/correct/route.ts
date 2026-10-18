import { NextResponse } from "next/server";

import { createAdminClient } from "../../../../lib/supabase/admin";

type CorrectionEntity =
  | "financial_account"
  | "financial_transaction"
  | "observation"
  | "document";

type CorrectionInput = {
  entityType: CorrectionEntity;
  entityId: string;
  changes: Record<string, unknown>;
  reason: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCorrectionInput(value: unknown): CorrectionInput {
  if (!isRecord(value)) {
    throw new Error("invalid_correction_payload");
  }

  const entityType = value.entityType;
  const entityId = value.entityId;
  const changes = value.changes;
  const reason = value.reason;

  if (
    entityType !== "financial_account" &&
    entityType !== "financial_transaction" &&
    entityType !== "observation" &&
    entityType !== "document"
  ) {
    throw new Error("invalid_correction_entity_type");
  }

  if (typeof entityId !== "string" || !UUID_PATTERN.test(entityId)) {
    throw new Error("invalid_correction_entity_id");
  }

  if (!isRecord(changes) || Object.keys(changes).length === 0) {
    throw new Error("invalid_correction_changes");
  }

  if (typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > 1000) {
    throw new Error("invalid_correction_reason");
  }

  return {
    entityType,
    entityId,
    changes,
    reason: reason.trim(),
  };
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "missing_bearer_token" }, { status: 401 });
  }

  let input: CorrectionInput;
  try {
    input = parseCorrectionInput(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_correction_payload" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });
    }

    let result: {
      data: unknown;
      error: { message: string } | null;
    };

    switch (input.entityType) {
      case "financial_account":
        result = await admin.rpc("server_correct_financial_account", {
          p_user_id: data.user.id,
          p_account_id: input.entityId,
          p_changes: input.changes,
          p_reason: input.reason,
        });
        break;
      case "financial_transaction":
        result = await admin.rpc("server_correct_financial_transaction", {
          p_user_id: data.user.id,
          p_transaction_id: input.entityId,
          p_changes: input.changes,
          p_reason: input.reason,
        });
        break;
      case "observation":
        result = await admin.rpc("server_correct_observation", {
          p_user_id: data.user.id,
          p_observation_id: input.entityId,
          p_changes: input.changes,
          p_reason: input.reason,
        });
        break;
      case "document":
        result = await admin.rpc("server_correct_document", {
          p_user_id: data.user.id,
          p_document_id: input.entityId,
          p_changes: input.changes,
          p_reason: input.reason,
        });
        break;
    }

    if (result.error) {
      if (
        result.error.message.includes("not found") ||
        result.error.message.includes("unsupported") ||
        result.error.message.includes("cannot be blank") ||
        result.error.message.includes("must be") ||
        result.error.message.includes("at least one")
      ) {
        return NextResponse.json({ error: "correction_rejected" }, { status: 400 });
      }

      throw new Error(`Unable to apply fact correction: ${result.error.message}`);
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    console.error("fact correction failed", error);
    return NextResponse.json({ error: "fact_correction_failed" }, { status: 500 });
  }
}
