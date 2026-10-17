import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase/client';
import { automaticSyncEnabled, runAutomaticHealthSync, cancelHealthSync } from '../lib/health/automatic-health-sync';
import { scheduleBackgroundHealthSync, stopBackgroundHealthSync } from '../lib/health/background-health-sync';

export default function RootLayout() {
  useEffect(() => {
    let disposed = false;
    const resume = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (disposed) return;
        if (!data.session || !automaticSyncEnabled(data.session.user.id)) {
          await stopBackgroundHealthSync();
          return;
        }
        await scheduleBackgroundHealthSync(data.session.user.id);
        await runAutomaticHealthSync();
      } catch { /* Collector stores safe retry state; never crash the app shell. */ }
    };
    void resume();
    const state = AppState.addEventListener('change', next => { if (next === 'active') void resume(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void resume(); }, 60_000);
    const { data } = supabase.auth.onAuthStateChange(() => {
      cancelHealthSync();
      // Supabase auth operations must run outside its callback/lock.
      setTimeout(() => { void resume(); }, 0);
    });
    return () => { disposed = true; state.remove(); clearInterval(timer); data.subscription.unsubscribe(); cancelHealthSync(); };
  }, []);
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}

