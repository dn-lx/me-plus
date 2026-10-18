import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseNowAction,
  evaluateCalendarAvailability,
  isRecommendationValid,
} from "../packages/domain/src/now-ranking.ts";
import { TodayController } from "../apps/mobile/lib/today/today-controller.ts";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockSupabase(overrides = {}) {
  const queryLog = [];
  const state = {
    user: { id: "user-123", email: "user@example.test" },
    getUserHandler: null,
    signOutHandler: null,
    actionsData: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Must Action",
        priority: "must",
        status: "planned",
        estimated_minutes: 20,
        instructions: "Do this first",
        due_at: "2026-10-17T14:00:00Z",
        available_from: null,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Should Action",
        priority: "should",
        status: "available",
        estimated_minutes: 45,
        instructions: null,
        due_at: null,
        available_from: null,
      },
    ],
    actionsError: null,
    guidanceData: [
      {
        id: "rec-1",
        title: "Take a break",
        rationale: "You worked 3 hours",
        confidence: "high",
        generated_at: "2026-10-17T11:00:00Z",
        expires_at: null,
      },
    ],
    guidanceError: null,
    calendarData: [
      {
        starts_at: "2026-10-17T13:00:00Z",
        ends_at: "2026-10-17T13:30:00Z",
      },
    ],
    calendarError: null,
    rpcHandler: null,
    readbackHandler: null,
    ...overrides,
  };

  const client = {
    queryLog,
    auth: {
      async getUser() {
        queryLog.push({ type: "auth.getUser" });
        if (state.getUserHandler) {
          return state.getUserHandler();
        }
        return {
          data: { user: state.user },
          error: null,
        };
      },
      async signOut() {
        queryLog.push({ type: "auth.signOut" });
        if (state.signOutHandler) {
          return state.signOutHandler();
        }
        state.user = null;
        return { error: null };
      },
      async signInWithPassword({ email, password }) {
        queryLog.push({ type: "auth.signInWithPassword", email });
        state.user = { id: "user-123", email };
        return { data: { user: state.user }, error: null };
      },
      onAuthStateChange(callback) {
        return {
          data: {
            subscription: {
              unsubscribe() {
                queryLog.push({ type: "auth.unsubscribe" });
              },
            },
          },
        };
      },
    },
    from(table) {
      const call = { table, filters: [], order: null, limit: null };
      queryLog.push(call);

      const builder = {
        select(columns) {
          call.select = columns;
          return builder;
        },
        eq(col, val) {
          call.filters.push({ op: "eq", col, val });
          return builder;
        },
        in(col, val) {
          call.filters.push({ op: "in", col, val });
          return builder;
        },
        gte(col, val) {
          call.filters.push({ op: "gte", col, val });
          return builder;
        },
        gt(col, val) {
          call.filters.push({ op: "gt", col, val });
          return builder;
        },
        or(val) {
          call.filters.push({ op: "or", val });
          return builder;
        },
        order(col, opts) {
          call.order = { col, opts };
          return builder;
        },
        limit(count) {
          call.limit = count;
          return builder;
        },
        async maybeSingle() {
          call.op = "maybeSingle";
          if (state.readbackHandler) {
            return state.readbackHandler(call);
          }
          const item = state.actionsData.find(
            (a) => a.id === call.filters.find((f) => f.col === "id")?.val,
          );
          return { data: item ?? null, error: null };
        },
        then(onfulfilled, onrejected) {
          let res;
          if (table === "actions") {
            res = { data: state.actionsData, error: state.actionsError };
          } else if (table === "recommendations") {
            res = { data: state.guidanceData, error: state.guidanceError };
          } else if (table === "calendar_events") {
            res = { data: state.calendarData, error: state.calendarError };
          } else {
            res = { data: [], error: null };
          }
          return Promise.resolve(res).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
    async rpc(name, params) {
      queryLog.push({ type: "rpc", name, params });
      if (state.rpcHandler) {
        return state.rpcHandler(name, params);
      }
      return { data: { ok: true, replayed: false }, error: null };
    },
  };

  return { client, state, queryLog };
}

test("loadToday enforces user_id boundaries, exact filters, bounds, and unexpired guidance", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const { client, queryLog } = createMockSupabase();
  const controller = new TodayController(client, () => clock);

  const state = await controller.loadToday();

  assert.equal(state.status, "ready");
  assert.equal(state.userId, "user-123");
  assert.equal(state.actions.length, 2);
  assert.equal(state.guidance.length, 1);
  assert.equal(state.nowAction?.id, "11111111-1111-1111-1111-111111111111");

  const actionQuery = queryLog.find((q) => q.table === "actions");
  assert.ok(actionQuery);
  assert.deepEqual(actionQuery.filters.find((f) => f.col === "user_id"), {
    op: "eq",
    col: "user_id",
    val: "user-123",
  });
  assert.deepEqual(actionQuery.filters.find((f) => f.col === "status"), {
    op: "in",
    col: "status",
    val: ["available", "planned", "in_progress", "partial"],
  });
  assert.equal(actionQuery.limit, 40);

  const recQuery = queryLog.find((q) => q.table === "recommendations");
  assert.ok(recQuery);
  assert.deepEqual(recQuery.filters.find((f) => f.col === "user_id"), {
    op: "eq",
    col: "user_id",
    val: "user-123",
  });
  assert.equal(recQuery.limit, 3);
  assert.ok(recQuery.filters.some((f) => f.op === "gte" && f.col === "generated_at"));

  const calQuery = queryLog.find((q) => q.table === "calendar_events");
  assert.ok(calQuery);
  assert.deepEqual(calQuery.filters.find((f) => f.col === "user_id"), {
    op: "eq",
    col: "user_id",
    val: "user-123",
  });
  assert.deepEqual(calQuery.filters.find((f) => f.col === "busy"), {
    op: "eq",
    col: "busy",
    val: true,
  });
  assert.equal(calQuery.limit, 12);
});

test("duplicate decision taps initiated synchronously before getUser resolves are locked and rejected", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const { client, state, queryLog } = createMockSupabase();
  const controller = new TodayController(client, () => clock);
  await controller.loadToday();

  const id = "11111111-1111-1111-1111-111111111111";

  // Create deferred getUser promise
  const deferredUser = createDeferred();
  state.getUserHandler = () => deferredUser.promise;

  // Set up matching readback
  state.readbackHandler = () => ({
    data: {
      id,
      title: "Must Action",
      priority: "must",
      status: "completed",
      estimated_minutes: 20,
      instructions: null,
      due_at: null,
      available_from: null,
    },
    error: null,
  });

  // Call tap1 and tap2 synchronously BEFORE getUser resolves!
  const tap1Promise = controller.recordDecision(id, "completed");
  const tap2Promise = controller.recordDecision(id, "completed");

  // tap2 must immediately fail with lock rejection before tap1's getUser finishes
  const tap2Result = await tap2Promise;
  assert.equal(tap2Result.ok, false);
  assert.match(tap2Result.message, /already in progress/i);

  // Now resolve getUser for tap1
  deferredUser.resolve({ data: { user: { id: "user-123" } }, error: null });

  const tap1Result = await tap1Promise;
  assert.equal(tap1Result.ok, true);

  const rpcCalls = queryLog.filter((q) => q.type === "rpc");
  assert.equal(rpcCalls.length, 1, "RPC must be invoked exactly once");
});

test("old-epoch mutation failure cannot alter state of a newly active account", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const { client, state } = createMockSupabase();
  const controller = new TodayController(client, () => clock);
  await controller.loadToday();

  const id = "11111111-1111-1111-1111-111111111111";

  const deferredRpc = createDeferred();
  const rpcStarted = createDeferred();
  state.rpcHandler = () => { rpcStarted.resolve(); return deferredRpc.promise; };

  // Begin mutation for User 1
  const user1Mutation = controller.recordDecision(id, "completed");
  await rpcStarted.promise;

  // User switches accounts while RPC is in-flight!
  state.user = { id: "user-b", email: "user-b@example.test" };
  controller.handleAccountChange("user-b", "user-b@example.test");
  assert.equal(controller.getState().userId, "user-b");

  // Now the deferred User 1 RPC fails with an error
  deferredRpc.reject(new Error("RPC failed for user 1"));
  const result = await user1Mutation;

  // User 1 mutation must not report success and must NOT corrupt User 2's state
  assert.equal(result.ok, false);
  assert.equal(controller.getState().userId, "user-b");
  assert.equal(controller.getState().actionMessage, null);
});

test("stale getUser response does not replace active account or discard current load", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const { client, state } = createMockSupabase();
  const controller = new TodayController(client, () => clock);

  const deferredUserA = createDeferred();
  let authReads = 0;
  state.getUserHandler = () => ++authReads === 1 ? deferredUserA.promise :
    Promise.resolve({ data: { user: { id: "user-b", email: "user-b@example.test" } }, error: null });

  // Load started for User A
  const loadPromise = controller.loadToday();

  // Account immediately changes to User B before User A's getUser resolves
  controller.handleAccountChange("user-b", "user-b@example.test");
  assert.equal(controller.getState().userId, "user-b");

  // User A's auth finally returns
  deferredUserA.resolve({ data: { user: { id: "user-a" } }, error: null });
  await loadPromise;

  // Active account must remain User B, not overwritten by stale User A!
  assert.equal(controller.getState().userId, "user-b");
});

test("readback error retains prior state and returns unconfirmed save error", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const id = "11111111-1111-1111-1111-111111111111";
  const { client, state } = createMockSupabase();
  const controller = new TodayController(client, () => clock);
  await controller.loadToday();

  // RPC succeeds, but readback returns error
  state.readbackHandler = () => ({
    data: null,
    error: { message: "connection dropped" },
  });

  const result = await controller.recordDecision(id, "completed");
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be confirmed/i);

  // Action must retain its prior state and NOT be removed!
  const actionInState = controller.getState().actions.find((a) => a.id === id);
  assert.ok(actionInState);
  assert.equal(actionInState.status, "planned");
});

test("readback with wrong status retains prior state and returns unconfirmed save error", async () => {
  const clock = new Date("2026-10-17T12:00:00Z");
  const id = "11111111-1111-1111-1111-111111111111";
  const { client, state } = createMockSupabase();
  const controller = new TodayController(client, () => clock);
  await controller.loadToday();

  // RPC reported success, but readback returned status still 'planned'
  state.readbackHandler = () => ({
    data: {
      id,
      title: "Must Action",
      priority: "must",
      status: "planned", // status did NOT transition to 'completed'!
      estimated_minutes: 20,
      instructions: null,
      due_at: null,
      available_from: null,
    },
    error: null,
  });

  const result = await controller.recordDecision(id, "completed");
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be confirmed/i);

  // Action must retain prior status in state
  const actionInState = controller.getState().actions.find((a) => a.id === id);
  assert.ok(actionInState);
  assert.equal(actionInState.status, "planned");
});

test("signOut accurately reports failure when auth service fails", async () => {
  const { client, state } = createMockSupabase();
  const controller = new TodayController(client);

  state.signOutHandler = () => ({
    error: { message: "Supabase auth session invalid" },
  });

  const result = await controller.signOut();
  assert.equal(result.ok, false);
  assert.match(result.message, /Unable to disconnect/i);
  assert.doesNotMatch(result.message, /Supabase|session/i);
});

test("destroy invalidates pending operations and prevents reactivation", async () => {
  const { client, queryLog } = createMockSupabase();
  const controller = new TodayController(client);

  controller.destroy();

  const decisionResult = await controller.recordDecision(
    "11111111-1111-1111-1111-111111111111",
    "completed",
  );
  assert.equal(decisionResult.ok, false);
  assert.match(decisionResult.message, /unavailable/i);

  const rpcCalls = queryLog.filter((q) => q.type === "rpc");
  assert.equal(rpcCalls.length, 0);
});

test("calendar evaluation fails closed on equal endpoints, inverted intervals, or invalid now", () => {
  const validNow = new Date("2026-10-17T12:00:00Z");
  const invalidNow = new Date("invalid-date");

  // Invalid clock fails closed
  assert.equal(evaluateCalendarAvailability([], invalidNow).isValid, false);

  // Equal endpoints fail closed
  const equalEndpoints = [{ starts_at: "2026-10-17T13:00:00Z", ends_at: "2026-10-17T13:00:00Z" }];
  assert.equal(evaluateCalendarAvailability(equalEndpoints, validNow).isValid, false);

  // Inverted interval fails closed
  const inverted = [{ starts_at: "2026-10-17T14:00:00Z", ends_at: "2026-10-17T13:00:00Z" }];
  assert.equal(evaluateCalendarAvailability(inverted, validNow).isValid, false);

  // Valid event works properly
  const validEvents = [{ starts_at: "2026-10-17T13:00:00Z", ends_at: "2026-10-17T13:30:00Z" }];
  const validResult = evaluateCalendarAvailability(validEvents, validNow);
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.isBusy, false);
  assert.equal(validResult.minutesAvailable, 60);
});

test("recommendation validation rejects future timestamps, invalid clock, or expiration before generation", () => {
  const validNow = new Date("2026-10-17T12:00:00Z");
  const invalidNow = new Date("invalid");

  // Invalid clock rejected
  assert.equal(
    isRecommendationValid(
      { id: "1", title: "Walk", generated_at: "2026-10-17T10:00:00Z" },
      invalidNow,
    ),
    false,
  );

  // Future generation time rejected
  assert.equal(
    isRecommendationValid(
      { id: "2", title: "Walk", generated_at: "2026-10-17T13:00:00Z" },
      validNow,
    ),
    false,
  );

  // Expires before generation rejected
  assert.equal(
    isRecommendationValid(
      {
        id: "3",
        title: "Walk",
        generated_at: "2026-10-17T10:00:00Z",
        expires_at: "2026-10-17T09:00:00Z",
      },
      validNow,
    ),
    false,
  );
});
