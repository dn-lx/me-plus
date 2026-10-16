export type NowCandidate = {
  id: string;
  priority: string;
  status: string;
  estimated_minutes: number | null;
  due_at: string | null;
  available_from: string | null;
};

export function chooseNowAction<T extends NowCandidate>(actions: readonly T[], now: Date, minutesAvailable: number | null): T | null {
  if (minutesAvailable !== null && minutesAvailable <= 0) return null;
  const stamp = now.getTime();
  const score = (a: T) => {
    const base = a.priority === "must" ? 100 : a.priority === "should" ? 55 : 10;
    const remaining = a.due_at ? Date.parse(a.due_at) - stamp : Infinity;
    return base + (remaining <= 0 ? 45 : remaining <= 3600000 ? 25 : remaining <= 86400000 ? 10 : 0) + (a.status === "in_progress" ? 12 : 0);
  };
  const eligible = actions.filter(a =>
    ["available", "planned", "in_progress", "partial"].includes(a.status) &&
    (!a.available_from || Date.parse(a.available_from) <= stamp) &&
    (minutesAvailable === null || (a.estimated_minutes !== null && a.estimated_minutes <= minutesAvailable))
  );
  return [...eligible].sort((a,b) => score(b) - score(a) ||
    ((a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)) ||
    a.id.localeCompare(b.id))[0] ?? null;
}
