import { chooseNowAction, evaluateCalendarAvailability, type NowCandidate, type CalendarEventLike } from "../../../packages/domain/src/now-ranking.ts";

export function selectTodayNow<T extends NowCandidate>(actions: readonly T[], events: readonly CalendarEventLike[], clock: Date, error?: unknown) {
  const availability = evaluateCalendarAvailability(events, clock, error);
  const now = availability.isValid && !availability.isBusy ? chooseNowAction(actions, clock, availability.minutesAvailable) : null;
  const nowReason = !availability.isValid ? "calendar_unavailable" : availability.isBusy ? "in_commitment" : now ? "has_action" : actions.length ? "no_fit" : "no_actions";
  return { availability, now, nowReason };
}
