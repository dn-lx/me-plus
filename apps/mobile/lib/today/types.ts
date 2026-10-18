export type TodayAction = {
  id: string;
  title: string;
  priority: "must" | "should" | "bonus" | string;
  status: "available" | "planned" | "in_progress" | "partial" | "completed" | "skipped" | string;
  estimated_minutes: number | null;
  instructions: string | null;
  due_at: string | null;
  available_from: string | null;
};

export type TodayGuidance = {
  id: string;
  title: string;
  rationale: string | null;
  confidence: string | null;
  generated_at: string;
  expires_at?: string | null;
};

export type TodayCalendarEvent = {
  starts_at: string;
  ends_at: string;
};

export type NowReason =
  | "has_action"
  | "calendar_unavailable"
  | "in_commitment"
  | "no_fit"
  | "no_actions";

export type TodayState = {
  status: "idle" | "loading" | "ready" | "error" | "signed_out";
  userId: string | null;
  userEmail: string | null;
  actions: TodayAction[];
  guidance: TodayGuidance[];
  nowAction: TodayAction | null;
  nowReason: NowReason;
  minutesAvailable: number | null;
  busyNow: boolean;
  calendarUnavailable: boolean;
  errorMessage: string | null;
  refreshedAt: string | null;
  evaluatedAt: string | null;
  isStale: boolean;
  submittingActionId: string | null;
  actionMessage: { actionId: string; text: string; isError: boolean } | null;
};


export type ActionDecisionType = "completed" | "partial" | "skipped";

export type ActionDecisionResult = {
  ok: boolean;
  message: string;
};
