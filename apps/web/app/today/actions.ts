"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

export type FeedbackState = { ok: boolean; message: string };

export async function rateRecommendation(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const id = String(form.get("recommendation_id") ?? "");
  const stars = Number(form.get("stars"));
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id) || !Number.isInteger(stars) || stars < 1 || stars > 5)
    return { ok: false, message: "Invalid rating." };
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, message: "Please sign in again." };
  const { data: recommendation, error: readError } = await supabase.from("recommendations")
    .select("id").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (readError || !recommendation) return { ok: false, message: "Recommendation not found." };
  const { error } = await supabase.from("recommendation_feedback").insert({
    user_id: auth.user.id, recommendation_id: id, helpfulness: stars,
    recorded_at: new Date().toISOString()
  });
  if (error) return { ok: false, message: "Could not save your rating. Please retry." };
  revalidatePath("/today");
  return { ok: true, message: "Rating saved. Thank you!" };
}
