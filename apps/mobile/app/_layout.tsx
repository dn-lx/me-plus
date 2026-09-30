import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";

import {
  ensureAutomaticHealthSyncRegistered,
  HEALTH_FOREGROUND_POLL_INTERVAL_MS,
  runForegroundHealthSyncIfDue,
} from "../lib/health/automatic-health-sync";

export default function RootLayout() {
  useEffect(() => {
    const catchUp = async () => {
      try {
        await ensureAutomaticHealthSyncRegistered();
        await runForegroundHealthSyncIfDue();
      } catch {
        // Automatic sync persists a privacy-safe status for the Health Connect screen.
        // Do not crash the app shell if Health Connect is unavailable or temporarily fails.
      }
    };

    void catchUp();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void catchUp();
      }
    });

    const foregroundTimer = setInterval(() => {
      if (AppState.currentState === "active") {
        void runForegroundHealthSyncIfDue();
      }
    }, HEALTH_FOREGROUND_POLL_INTERVAL_MS);

    return () => {
      appStateSubscription.remove();
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
