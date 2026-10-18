import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "../supabase/client";
import { INITIAL_TODAY_STATE, TodayController } from "./today-controller.ts";
import type { ActionDecisionResult, ActionDecisionType, TodayState } from "./types.ts";

export function useToday() {
  const [state, setState] = useState<TodayState>(INITIAL_TODAY_STATE);
  const controllerRef = useRef<TodayController | null>(null);

  useEffect(() => {
    const controller = new TodayController(supabase as any);
    controllerRef.current = controller;

    const unsubscribe = controller.subscribe((nextState) => {
      setState(nextState);
    });

    void controller.loadToday();

    // Foreground / AppState refresh
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        void controller.loadToday();
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    // Bounded periodic refresh timer (every 5 minutes)
    const intervalTimer = setInterval(() => {
      void controller.loadToday();
    }, 5 * 60 * 1000);

    return () => {
      controllerRef.current = null;
      clearInterval(intervalTimer);
      appStateSub.remove();
      unsubscribe();
      controller.destroy();
    };
  }, []);

  return {
    state,
    loadToday: (): Promise<TodayState> => {
      if (controllerRef.current) {
        return controllerRef.current.loadToday();
      }
      return Promise.resolve(state);
    },
    recordDecision: (actionId: string, decision: ActionDecisionType): Promise<ActionDecisionResult> => {
      if (controllerRef.current) {
        return controllerRef.current.recordDecision(actionId, decision);
      }
      return Promise.resolve({ ok: false, message: "Service is unavailable." });
    },
    signIn: (email: string, password: string): Promise<{ ok: boolean; message: string }> => {
      if (controllerRef.current) {
        return controllerRef.current.signIn(email, password);
      }
      return Promise.resolve({ ok: false, message: "Service is unavailable." });
    },
    signOut: (): Promise<{ ok: boolean; message: string }> => {
      if (controllerRef.current) {
        return controllerRef.current.signOut();
      }
      return Promise.resolve({ ok: true, message: "This phone is disconnected from Me+." });
    },
  };
}
