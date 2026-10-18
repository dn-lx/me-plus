import { TodayView } from "../lib/today/today-view.tsx";
import { useToday } from "../lib/today/use-today.ts";

export default function HomeScreen() {
  const { state, loadToday, recordDecision, signIn, signOut } = useToday();

  return (
    <TodayView
      onDecision={recordDecision}
      onRefresh={loadToday}
      onSignIn={signIn}
      onSignOut={signOut}
      state={state}
    />
  );
}
