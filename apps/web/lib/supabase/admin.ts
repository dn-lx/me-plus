import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./env";

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY");
  }

  const { url } = getSupabasePublicConfig();

  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
