"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";
import {
  executeActionDecision,
  type ActionDecisionResult,
} from "../../lib/action-decision-handler";

export type ActionDecisionState = ActionDecisionResult;

export async function recordActionDecision(
  _previous: ActionDecisionState,
  form: FormData,
): Promise<ActionDecisionState> {
  const id = String(form.get("action_id") ?? "");
  const decision = String(form.get("decision") ?? "");

  const db = await createClient();
  const result = await executeActionDecision(id, decision, db);

  if (result.ok) {
    revalidatePath("/today");
  }

  return result;
}
