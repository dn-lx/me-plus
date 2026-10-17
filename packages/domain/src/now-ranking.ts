export type NowCandidate = {
  id: string;
  priority: string;
  status: string;
  estimated_minutes: number | null;
  due_at: string | null;
  available_from: string | null;
};

export function chooseNowAction<T extends NowCandidate>(
  actions: readonly T[],
  now: Date,
  minutesAvailable: number | null,
): T | null {
  const stamp = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(stamp)) return null;
  if (minutesAvailable !== null && minutesAvailable <= 0) return null;

  const score = (a: T) => {
    const base = a.priority === "must" ? 100 : a.priority === "should" ? 55 : 10;
    const remaining = a.due_at ? Date.parse(a.due_at) - stamp : Infinity;
    return (
      base +
      (remaining <= 0 ? 45 : remaining <= 3600000 ? 25 : remaining <= 86400000 ? 10 : 0) +
      (a.status === "in_progress" ? 12 : 0)
    );
  };

  const eligible = actions.filter(
    (a) =>
      ["available", "planned", "in_progress", "partial"].includes(a.status) &&
      (!a.available_from || Date.parse(a.available_from) <= stamp) &&
      (minutesAvailable === null || (a.estimated_minutes !== null && a.estimated_minutes <= minutesAvailable)),
  );

  return (
    [...eligible].sort(
      (a, b) =>
        score(b) - score(a) ||
        (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

export type CalendarEventLike = {
  starts_at: string;
  ends_at: string;
};

export type CalendarAvailability = {
  isValid: boolean;
  isBusy: boolean;
  minutesAvailable: number | null;
};

export function evaluateCalendarAvailability(
  events: readonly CalendarEventLike[],
  now: Date,
  calendarError?: unknown,
): CalendarAvailability {
  const stamp = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(stamp) || calendarError) {
    return { isValid: false, isBusy: false, minutesAvailable: null };
  }

  for (const event of events) {
    const starts = Date.parse(event.starts_at);
    const ends = Date.parse(event.ends_at);
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends) {
      return { isValid: false, isBusy: false, minutesAvailable: null };
    }
  }

  const isBusy = events.some((event) => {
    const starts = Date.parse(event.starts_at);
    const ends = Date.parse(event.ends_at);
    return starts <= stamp && ends > stamp;
  });

  if (isBusy) {
    return { isValid: true, isBusy: true, minutesAvailable: 0 };
  }

  const futureStarts = events
    .map((event) => Date.parse(event.starts_at))
    .filter((t) => t > stamp)
    .sort((a, b) => a - b);
  const nextStart = futureStarts[0];
  const minutesAvailable = nextStart !== undefined ? Math.floor((nextStart - stamp) / 60000) : null;
  return { isValid: true, isBusy: false, minutesAvailable };
}

export type RecommendationLike = {
  id: string;
  title: string;
  rationale?: string | null;
  confidence?: string | null;
  generated_at: string;
  expires_at?: string | null;
};

export function isRecommendationValid(
  recommendation: RecommendationLike,
  now: Date,
): boolean {
  const stamp = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(stamp)) return false;

  const generated = Date.parse(recommendation.generated_at);
  if (!Number.isFinite(generated)) return false;
  if (generated > stamp) return false;

  const horizon24h = stamp - 86400000;
  if (generated < horizon24h) return false;

  if (recommendation.expires_at !== undefined && recommendation.expires_at !== null) {
    const expires = Date.parse(recommendation.expires_at);
    if (!Number.isFinite(expires) || expires <= stamp || expires <= generated) {
      return false;
    }
  }

  return true;
}
