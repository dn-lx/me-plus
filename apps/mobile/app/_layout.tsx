import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase/client";

import {
  HEALTH_FOREGROUND_POLL_INTERVAL_MS,
  runForegroundHealthSyncIfDue,
} from "../lib/health/foreground-health-sync";

export default function RootLayout() {
  useEffect(() => {
    const catchUp = async (force = false) => {
      try {
        await runForegroundHealthSyncIfDue(force);
      } catch {
        // Automatic sync persists a privacy-safe status for the Health Connect screen.
        // Do not crash the app shell if Health Connect is unavailable or temporarily fails.
      }
    };

    void catchUp();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void catchUp(true);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Run outside the auth callback so getSession cannot wait on that callback.
        setTimeout(() => void catchUp(true), 0);
      }
    });

    const foregroundTimer = setInterval(() => {
      if (AppState.currentState === "active") {
        void catchUp();
      }
    }, HEALTH_FOREGROUND_POLL_INTERVAL_MS);

    return () => {
      appStateSubscription.remove();
      authListener.subscription.unsubscribe();
      clearInterval(foregroundTimer);
    };
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}
