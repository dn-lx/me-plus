import type {SupabaseClient} from "@supabase/supabase-js";
export type SupabaseClientLike = Pick<SupabaseClient, "auth" | "from" | "rpc">;

export type ActionDecisionResult = {
  ok: boolean;
  message: string;
};

export const UUID_STRICT_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ALLOWED_DECISION_TYPES = ["completed", "partial", "skipped"] as const;
export type DecisionType = (typeof ALLOWED_DECISION_TYPES)[number];

export const ALLOWED_OPEN_STATUSES = [
  "available",
  "planned",
  "in_progress",
  "partial",
] as const;

async function executeCheckedDecision(
  actionId: string,
  decision: string,
  client: SupabaseClientLike,
): Promise<ActionDecisionResult> {
  if (
    typeof actionId !== "string" ||
    !UUID_STRICT_REGEX.test(actionId) ||
    !ALLOWED_DECISION_TYPES.includes(decision as DecisionType)
  ) {
    return { ok: false, message: "Invalid action decision." };
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user) {
    return { ok: false, message: "Please sign in." };
  }
  const userId = authData.user.id;

  const { data: action, error: readError } = await client
    .from("actions")
    .select("id,status")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (
    readError ||
    !action ||
    !ALLOWED_OPEN_STATUSES.includes(action.status as (typeof ALLOWED_OPEN_STATUSES)[number])
  ) {
    return { ok: false, message: "Action is unavailable or already closed." };
  }

  const { error: rpcError } = await client.rpc("record_meplus_action_decision", {
    p_action_id: actionId,
    p_decision: decision,
  });

  if (rpcError) {
    return { ok: false, message: "Could not record the action. Please retry." };
  }

  // Owner-filtered matching readback
  const { data: readback, error: readbackError } = await client
    .from("actions")
    .select("id,status")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readbackError || !readback) {
    return {
      ok: false,
      message: "Action update could not be confirmed. Please refresh.",
    };
  }

  if (readback.id !== actionId || readback.status !== decision) {
    return {
      ok: false,
      message: "Action update could not be confirmed. Please refresh.",
    };
  }

  return { ok: true, message: "Action recorded." };
}


export async function executeActionDecision(actionId: string, decision: string, client: SupabaseClientLike): Promise<ActionDecisionResult> {
  try { return await executeCheckedDecision(actionId, decision, client); }
  catch { return {ok:false, message:"Action update could not be confirmed. Please refresh before retrying."}; }
}
