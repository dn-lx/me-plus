import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./env";

const { url, publishableKey } = getSupabasePublicConfig();

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
