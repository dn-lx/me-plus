import {
  chooseNowAction,
  evaluateCalendarAvailability,
  isRecommendationValid,
} from "../../../../packages/domain/src/now-ranking.ts";
import type {
  ActionDecisionResult,
  ActionDecisionType,
  NowReason,
  TodayAction,
  TodayCalendarEvent,
  TodayGuidance,
  TodayState,
} from "./types.ts";

export interface SupabaseAuthLike {
  getUser(): Promise<{
    data: { user: { id: string; email?: string } | null };
    error: unknown | null;
  }>;
  signOut?(options?: { scope: "local" }): Promise<{ error: unknown | null }>;
  signInWithPassword?(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: unknown; error: unknown | null }>;
  onAuthStateChange?(
    callback: (
      event: string,
      session: { user: { id: string; email?: string } | null } | null,
    ) => void,
  ): { data: { subscription: { unsubscribe: () => void } } };
}

export interface SupabaseFilterBuilderLike<T = unknown> {
  select(columns: string): this;
  eq(column: string, value: unknown): this;
  in(column: string, values: readonly unknown[]): this;
  gte(column: string, value: unknown): this;
  gt(column: string, value: unknown): this;
  or(filter: string): this;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this;
  limit(count: number): this;
  maybeSingle(): Promise<{ data: T | null; error: unknown | null }>;
  then<TResult1 = { data: T[] | null; error: unknown | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T[] | null; error: unknown | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface SupabaseClientLike {
  auth: SupabaseAuthLike;
  from(table: string): SupabaseFilterBuilderLike<any>;
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
}

export const INITIAL_TODAY_STATE: TodayState = {
  status: "idle",
  userId: null,
  userEmail: null,
  actions: [],
  guidance: [],
  nowAction: null,
  nowReason: "no_actions",
  minutesAvailable: null,
  busyNow: false,
  calendarUnavailable: false,
  errorMessage: null,
  refreshedAt: null,
  evaluatedAt: null,
  isStale: false,
  submittingActionId: null,
  actionMessage: null,
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const ALLOWED_OPEN_STATUSES = ["available", "planned", "in_progress", "partial"] as const;

export class TodayController {
  private readonly supabase: SupabaseClientLike;
  private readonly clock: () => Date;
  private state: TodayState;
  private readonly listeners: Set<(state: TodayState) => void>;
  private activeRequestId = 0;
  private activeUserId: string | null = null;
  private lifecycleEpoch = 0;
  private mutationLock = false;
  private currentOperationId = 0;
  private isDestroyed = false;
  private authSubscription: { unsubscribe: () => void } | null = null;

  constructor(supabase: SupabaseClientLike, clock: () => Date = () => new Date()) {
    this.supabase = supabase;
    this.clock = clock;
    this.state = { ...INITIAL_TODAY_STATE };
    this.listeners = new Set();

    if (this.supabase.auth.onAuthStateChange) {
      const { data } = this.supabase.auth.onAuthStateChange((_event, session) => {
        if (this.isDestroyed) return;
        const nextUserId = session?.user?.id ?? null;
        if (nextUserId !== this.activeUserId) {
          this.handleAccountChange(nextUserId, session?.user?.email ?? null);
        }
      });
      this.authSubscription = data.subscription;
    }
  }

  public getState(): TodayState {
    return this.state;
  }

  public subscribe(listener: (state: TodayState) => void): () => void {
    if (this.isDestroyed) {
      return () => {};
    }
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    if (this.isDestroyed) return;
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {}
    }
  }

  private setState(patch: Partial<TodayState>): void {
    if (this.isDestroyed) return;
    this.state = { ...this.state, ...patch };
    this.emitState();
  }

  public handleAccountChange(newUserId: string | null, email: string | null = null): void {
    if (this.isDestroyed) return;
    this.lifecycleEpoch++;
    this.activeRequestId++;
    this.mutationLock = false;
    this.activeUserId = newUserId;

    if (!newUserId) {
      this.state = {
        ...INITIAL_TODAY_STATE,
        status: "signed_out",
      };
      this.emitState();
    } else {
      this.state = {
        ...INITIAL_TODAY_STATE,
        status: "loading",
        userId: newUserId,
        userEmail: email,
      };
      this.emitState();
      void this.loadToday();
    }
  }

  public async loadToday(): Promise<TodayState> {
    if (this.isDestroyed || this.mutationLock) return this.state;

    let epoch = this.lifecycleEpoch;
    const requestId = ++this.activeRequestId;
    this.setState({ status: "loading", errorMessage: null });

    let authResult;
    try {
      authResult = await this.supabase.auth.getUser();
    } catch {
      if (!this.isDestroyed && this.lifecycleEpoch === epoch && requestId === this.activeRequestId) {
        this.activeUserId = null;
        this.setState({
          ...INITIAL_TODAY_STATE,
          status: "signed_out",
        });
      }
      return this.state;
    }

    // Check request ID and epoch BEFORE updating activeUserId
    if (this.isDestroyed || this.lifecycleEpoch !== epoch || requestId !== this.activeRequestId) {
      return this.state;
    }

    if (authResult.error || !authResult.data.user) {
      this.activeUserId = null;
      this.setState({
        ...INITIAL_TODAY_STATE,
        status: "signed_out",
      });
      return this.state;
    }

    const currentUserId = authResult.data.user.id;
    if (this.activeUserId !== currentUserId) {
      // getUser is authoritative even if a session event was missed.
      epoch = ++this.lifecycleEpoch;
      this.state = {
        ...INITIAL_TODAY_STATE,
        status: "loading",
        userId: currentUserId,
        userEmail: authResult.data.user.email ?? null,
      };
      this.emitState();
    }
    this.activeUserId = currentUserId;

    let evaluationClock = this.clock();
    const evaluatedStamp = evaluationClock.getTime();
    if (!Number.isFinite(evaluatedStamp)) {
      this.setState({
        status: "error",
        errorMessage: "We couldn't load your current Me+ priorities. Please refresh or try again later.",
      });
      return this.state;
    }

    const evaluatedIso = evaluationClock.toISOString();
    const horizon24h = new Date(evaluatedStamp - 86400000).toISOString();

    try {
      const [actionsResult, guidanceResult, calendarResult] = await Promise.all([
        this.supabase
          .from("actions")
          .select("id,title,priority,status,estimated_minutes,instructions,due_at,available_from")
          .eq("user_id", currentUserId)
          .in("status", ALLOWED_OPEN_STATUSES)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(40),
        this.supabase
          .from("recommendations")
          .select("id,title,rationale,confidence,generated_at,expires_at")
          .eq("user_id", currentUserId)
          .gte("generated_at", horizon24h)
          .or(`expires_at.is.null,expires_at.gt.${evaluatedIso}`)
          .order("generated_at", { ascending: false })
          .limit(3),
        this.supabase
          .from("calendar_events")
          .select("starts_at,ends_at")
          .eq("user_id", currentUserId)
          .eq("busy", true)
          .gt("ends_at", evaluatedIso)
          .order("starts_at", { ascending: true })
          .limit(12),
      ]);

      if (
        this.isDestroyed ||
        this.lifecycleEpoch !== epoch ||
        requestId !== this.activeRequestId ||
        this.activeUserId !== currentUserId
      ) {
        return this.state;
      }

      if (actionsResult.error || guidanceResult.error) {
        this.setState({
          status: "error",
          errorMessage: "We couldn't load your current Me+ priorities. Please refresh or try again later.",
          userId: currentUserId,
          userEmail: authResult.data.user.email ?? null,
        });
        return this.state;
      }

      // A commitment may have started while the network request was pending.
      evaluationClock = this.clock();
      if (!Number.isFinite(evaluationClock.getTime())) throw new Error("invalid_clock");
      const evaluationCompletedIso = evaluationClock.toISOString();
      const actions = (actionsResult.data ?? []) as TodayAction[];
      const rawGuidance = (guidanceResult.data ?? []) as TodayGuidance[];
      const validGuidance = rawGuidance.filter((g) => isRecommendationValid(g, evaluationClock));

      const rawCalendar = (calendarResult.data ?? []) as TodayCalendarEvent[];
      const availability = evaluateCalendarAvailability(rawCalendar, evaluationClock, calendarResult.error);

      let nowAction: TodayAction | null = null;
      let nowReason: NowReason = "no_actions";

      if (!availability.isValid) {
        nowAction = null;
        nowReason = "calendar_unavailable";
      } else if (availability.isBusy) {
        nowAction = null;
        nowReason = "in_commitment";
      } else {
        nowAction = chooseNowAction(actions, evaluationClock, availability.minutesAvailable);
        if (nowAction) {
          nowReason = "has_action";
        } else if (actions.length === 0) {
          nowReason = "no_actions";
        } else {
          nowReason = "no_fit";
        }
      }

      const fetchCompletionIso = evaluationCompletedIso;

      this.setState({
        status: "ready",
        userId: currentUserId,
        userEmail: authResult.data.user.email ?? null,
        actions,
        guidance: validGuidance,
        nowAction,
        nowReason,
        minutesAvailable: availability.minutesAvailable,
        busyNow: availability.isBusy,
        calendarUnavailable: !availability.isValid,
        errorMessage: null,
        refreshedAt: fetchCompletionIso,
        evaluatedAt: evaluationCompletedIso,
        isStale: false,
      });

      return this.state;
    } catch {
      if (
        !this.isDestroyed &&
        this.lifecycleEpoch === epoch &&
        requestId === this.activeRequestId &&
        this.activeUserId === currentUserId
      ) {
        this.setState({
          status: "error",
          errorMessage: "We couldn't load your current Me+ priorities. Please refresh or try again later.",
          userId: currentUserId,
          userEmail: authResult.data.user.email ?? null,
        });
      }
      return this.state;
    }
  }

  public async recordDecision(
    actionId: string,
    decision: ActionDecisionType,
  ): Promise<ActionDecisionResult> {
    if (this.isDestroyed) {
      return { ok: false, message: "Service is unavailable." };
    }

    if (!UUID_REGEX.test(actionId) || !["completed", "partial", "skipped"].includes(decision)) {
      return { ok: false, message: "Invalid action decision." };
    }

    // Acquire mutation lock synchronously before ANY await!
    if (this.mutationLock) {
      return { ok: false, message: "An action update is already in progress." };
    }
    if (!this.activeUserId) return { ok: false, message: "Please sign in." };
    const stamp = this.clock().getTime();
    const evaluatedAt = this.state.evaluatedAt ? Date.parse(this.state.evaluatedAt) : NaN;
    if (this.state.status !== "ready" || this.state.isStale ||
        !Number.isFinite(stamp) || !Number.isFinite(evaluatedAt) || stamp - evaluatedAt > 300000) {
      return { ok: false, message: "Refresh Today before updating an action." };
    }
    this.mutationLock = true;
    const operationId = ++this.currentOperationId;
    const epoch = this.lifecycleEpoch;
    const targetUserId = this.activeUserId;

    this.setState({
      submittingActionId: actionId,
      actionMessage: null,
    });

    try {
      const authResult = await this.supabase.auth.getUser();

      if (this.isDestroyed || this.lifecycleEpoch !== epoch || this.currentOperationId !== operationId) {
        return { ok: false, message: "Session changed." };
      }

      if (authResult.error || !authResult.data.user) {
        return { ok: false, message: "Please sign in." };
      }

      const currentUserId = authResult.data.user.id;
      if (!targetUserId || targetUserId !== currentUserId) {
        return { ok: false, message: "Please sign in." };
      }

      const action = this.state.actions.find((a) => a.id === actionId);
      if (!action || !ALLOWED_OPEN_STATUSES.includes(action.status as any)) {
        return { ok: false, message: "Action is unavailable or already closed." };
      }

      // Invoke RPC
      const rpcResult = await this.supabase.rpc("record_meplus_action_decision", {
        p_action_id: actionId,
        p_decision: decision,
      });

      if (this.isDestroyed || this.lifecycleEpoch !== epoch || this.currentOperationId !== operationId) {
        return { ok: false, message: "Session changed." };
      }

      if (rpcResult.error) {
        this.setState({
          actionMessage: {
            actionId,
            text: "Could not record the action. Please retry.",
            isError: true,
          },
        });
        return { ok: false, message: "Could not record the action. Please retry." };
      }

      // Committed readback
      const readbackResult = await this.supabase
        .from("actions")
        .select("id,title,priority,status,estimated_minutes,instructions,due_at,available_from")
        .eq("id", actionId)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (this.isDestroyed || this.lifecycleEpoch !== epoch || this.currentOperationId !== operationId) {
        return { ok: false, message: "Session changed." };
      }

      // Validated matching readback and canonical status check
      if (readbackResult.error || !readbackResult.data) {
        this.setState({
          actionMessage: {
            actionId,
            text: "Action update could not be confirmed. Please refresh.",
            isError: true,
          },
        });
        return { ok: false, message: "Action update could not be confirmed. Please refresh." };
      }

      const updatedAction = readbackResult.data as TodayAction;
      if (updatedAction.id !== actionId || updatedAction.status !== decision) {
        this.setState({
          actionMessage: {
            actionId,
            text: "Action update could not be confirmed. Please refresh.",
            isError: true,
          },
        });
        return { ok: false, message: "Action update could not be confirmed. Please refresh." };
      }

      let nextActions = [...this.state.actions];
      if (ALLOWED_OPEN_STATUSES.includes(updatedAction.status as any)) {
        nextActions = nextActions.map((a) => (a.id === actionId ? updatedAction : a));
      } else {
        nextActions = nextActions.filter((a) => a.id !== actionId);
      }

      const clock = this.clock();
      let nextNowAction: TodayAction | null = null;
      let nextNowReason = this.state.nowReason;
      const elapsedMinutes = Math.max(0, (clock.getTime() - evaluatedAt) / 60000);
      const remainingMinutes = this.state.minutesAvailable === null ? null :
        Math.max(0, this.state.minutesAvailable - elapsedMinutes);

      if (!this.state.calendarUnavailable && !this.state.busyNow) {
        nextNowAction = elapsedMinutes <= 5 && (remainingMinutes === null || remainingMinutes > 0)
          ? chooseNowAction(nextActions, clock, remainingMinutes) : null;
        if (nextNowAction) {
          nextNowReason = "has_action";
        } else if (nextActions.length === 0) {
          nextNowReason = "no_actions";
        } else {
          nextNowReason = "no_fit";
        }
      }

      this.setState({
        actions: nextActions,
        nowAction: nextNowAction,
        nowReason: nextNowReason,
        actionMessage: {
          actionId,
          text: "Action recorded.",
          isError: false,
        },
      });

      return { ok: true, message: "Action recorded." };
    } catch {
      if (!this.isDestroyed && this.lifecycleEpoch === epoch && this.currentOperationId === operationId) {
        this.setState({
          actionMessage: {
            actionId,
            text: "Could not record the action. Please retry.",
            isError: true,
          },
        });
      }
      return { ok: false, message: "Could not record the action. Please retry." };
    } finally {
      if (this.currentOperationId === operationId) {
        this.mutationLock = false;
        if (!this.isDestroyed && this.lifecycleEpoch === epoch) {
          this.setState({ submittingActionId: null });
        }
      }
    }
  }

  public async signIn(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (this.isDestroyed) {
      return { ok: false, message: "Service is unavailable." };
    }

    if (!email.trim() || !password) {
      return { ok: false, message: "Enter your Me+ email and password first." };
    }

    if (!this.supabase.auth.signInWithPassword) {
      return { ok: false, message: "Authentication service unavailable." };
    }

    const authEpoch = this.lifecycleEpoch;
    this.setState({ status: "loading", errorMessage: null });
    try {
      const { error } = await this.supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (this.isDestroyed || this.lifecycleEpoch !== authEpoch) {
          return { ok: false, message: "Session changed. Check the current account." };
        }
        this.setState({
          status: "signed_out",
          errorMessage: "Unable to sign in. Please check your credentials and try again.",
        });
        return {
          ok: false,
          message: "Unable to sign in. Please check your credentials and try again.",
        };
      }

      await this.loadToday();
      return { ok: true, message: "Phone connected to Me+." };
    } catch {
      if (this.isDestroyed || this.lifecycleEpoch !== authEpoch) {
        return { ok: false, message: "Session changed. Check the current account." };
      }
      this.setState({
        status: "signed_out",
        errorMessage: "Unable to sign in. Please check your credentials and try again.",
      });
      return {
        ok: false,
        message: "Unable to sign in. Please check your credentials and try again.",
      };
    }
  }

  public async signOut(): Promise<{ ok: boolean; message: string }> {
    if (this.isDestroyed) return { ok: false, message: "Service is unavailable." };
    // Promptly clear private in-memory state
    this.handleAccountChange(null);

    if (this.supabase.auth.signOut) {
      try {
        const { error } = await this.supabase.auth.signOut({ scope: "local" });
        if (error) {
          return {
            ok: false,
            message: "Unable to disconnect phone from Me+. Please retry.",
          };
        }
      } catch {
        return {
          ok: false,
          message: "Unable to disconnect phone from Me+. Please retry.",
        };
      }
    }

    return { ok: true, message: "This phone is disconnected from Me+." };
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.lifecycleEpoch++;
    this.mutationLock = false;
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
      this.authSubscription = null;
    }
    this.listeners.clear();
  }
}
