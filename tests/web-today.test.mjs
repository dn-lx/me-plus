import {selectTodayNow} from "../apps/web/lib/today-snapshot.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseNowAction,
  evaluateCalendarAvailability,
  isRecommendationValid,
} from "../packages/domain/src/now-ranking.ts";
import {
  executeActionDecision,
  UUID_STRICT_REGEX,
} from "../apps/web/lib/action-decision-handler.ts";

function createMockSupabase(overrides = {}) {
  const queryLog = [];
  const state = {
    user: { id: "user-web-1", email: "user@example.test" },
    getUserHandler: null,
    actionData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "planned",
    },
    actionError: null,
    rpcHandler: null,
    rpcError: null,
    readbackData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
    },
    readbackError: null,
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
    },
    from(table) {
      const call = { table, filters: [], selected: null };
      queryLog.push(call);

      const builder = {
        select(columns) {
          call.selected = columns;
          return builder;
        },
        eq(col, val) {
          call.filters.push({ op: "eq", col, val });
          return builder;
        },
        async maybeSingle() {
          call.op = "maybeSingle";
          // Distinguish initial lookup vs readback by queryLog count or state
          if (queryLog.filter((q) => q.table === "actions" && q.op === "maybeSingle").length === 1) {
            return { data: state.actionData, error: state.actionError };
          }
          return { data: state.readbackData, error: state.readbackError };
        },
      };
      return builder;
    },
    async rpc(name, params) {
      queryLog.push({ type: "rpc", name, params });
      if (state.rpcHandler) {
        return state.rpcHandler(name, params);
      }
      return { data: { ok: true }, error: state.rpcError };
    },
  };

  return { client, state, queryLog };
}

// ---------------------------------------------------------------------------
// 1. Calendar availability evaluation & Web Today Now recommendation gating
// ---------------------------------------------------------------------------

test("evaluateCalendarAvailability fails closed on invalid clock, calendar error, equal timestamps, or inverted intervals", () => {
  const validClock = new Date("2026-10-17T14:00:00Z");
  const invalidClock = new Date(NaN);

  // Invalid clock fails closed
  const resInvalidClock = evaluateCalendarAvailability([], invalidClock);
  assert.equal(resInvalidClock.isValid, false);
  assert.equal(resInvalidClock.minutesAvailable, null);

  // Calendar error fails closed
  const resError = evaluateCalendarAvailability([], validClock, new Error("network_failed"));
  assert.equal(resError.isValid, false);
  assert.equal(resError.minutesAvailable, null);

  // Inverted interval (starts_at >= ends_at) fails closed
  const inverted = [
    { starts_at: "2026-10-17T15:00:00Z", ends_at: "2026-10-17T14:30:00Z" },
  ];
  const resInverted = evaluateCalendarAvailability(inverted, validClock);
  assert.equal(resInverted.isValid, false);
  assert.equal(resInverted.minutesAvailable, null);

  // Equal interval (starts_at === ends_at) fails closed
  const equalEnd = [
    { starts_at: "2026-10-17T15:00:00Z", ends_at: "2026-10-17T15:00:00Z" },
  ];
  const resEqual = evaluateCalendarAvailability(equalEnd, validClock);
  assert.equal(resEqual.isValid, false);
  assert.equal(resEqual.minutesAvailable, null);

  // Valid future event evaluates available minutes
  const validEvents = [
    { starts_at: "2026-10-17T14:45:00Z", ends_at: "2026-10-17T15:30:00Z" },
  ];
  const resValid = evaluateCalendarAvailability(validEvents, validClock);
  assert.equal(resValid.isValid, true);
  assert.equal(resValid.isBusy, false);
  assert.equal(resValid.minutesAvailable, 45);

  // Overlapping current commitment
  const busyEvents = [
    { starts_at: "2026-10-17T13:30:00Z", ends_at: "2026-10-17T14:30:00Z" },
  ];
  const resBusy = evaluateCalendarAvailability(busyEvents, validClock);
  assert.equal(resBusy.isValid, true);
  assert.equal(resBusy.isBusy, true);
  assert.equal(resBusy.minutesAvailable, 0);
});

test("web Today logic: invalid or error calendar MUST NOT produce a recommendation even when actions exist", () => {
  const clock = new Date("2026-10-17T14:00:00Z");
  const actions = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      priority: "must",
      status: "planned",
      estimated_minutes: 20,
      due_at: null,
      available_from: null,
    },
  ];

  // Calendar failed with an error
  const availability = evaluateCalendarAvailability([], clock, new Error("Calendar unavailable"));
  assert.equal(availability.isValid, false);

  // In Web Today, when availability.isValid is false, now recommendation is strictly null:
  const {now} = selectTodayNow(actions, [], clock, new Error("Calendar unavailable"));

  assert.equal(now, null, "Now recommendation must be null when calendar availability is invalid");
});

test("web Today logic: busy commitment produces null recommendation", () => {
  const clock = new Date("2026-10-17T14:00:00Z");
  const actions = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      priority: "must",
      status: "planned",
      estimated_minutes: 20,
      due_at: null,
      available_from: null,
    },
  ];

  const events = [
    { starts_at: "2026-10-17T13:45:00Z", ends_at: "2026-10-17T14:30:00Z" },
  ];
  const availability = evaluateCalendarAvailability(events, clock);
  assert.equal(availability.isValid, true);
  assert.equal(availability.isBusy, true);

  const {now} = selectTodayNow(actions, events, clock);

  assert.equal(now, null, "Now recommendation must be null during active commitments");
});

test("web Today logic: chooseNowAction selects highest priority action fitting available capacity", () => {
  const clock = new Date("2026-10-17T14:00:00Z");
  const actions = [
    {
      id: "action-long",
      priority: "must",
      status: "planned",
      estimated_minutes: 60, // Does not fit in 30 min window
      due_at: null,
      available_from: null,
    },
    {
      id: "action-fitting",
      priority: "should",
      status: "available",
      estimated_minutes: 25, // Fits in 30 min window
      due_at: null,
      available_from: null,
    },
  ];

  const events = [
    { starts_at: "2026-10-17T14:30:00Z", ends_at: "2026-10-17T15:00:00Z" },
  ];
  const availability = evaluateCalendarAvailability(events, clock);
  assert.equal(availability.minutesAvailable, 30);

  const {now} = selectTodayNow(actions, events, clock);
  assert.ok(now);
  assert.equal(now.id, "action-fitting");
});

// ---------------------------------------------------------------------------
// 2. Recommendation Freshness & Expiration (isRecommendationValid)
// ---------------------------------------------------------------------------

test("isRecommendationValid enforces 24h horizon, future timestamp rejection, and expiration bounds", () => {
  const clock = new Date("2026-10-17T14:00:00Z");

  // Valid recent recommendation without expiration
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-1",
        title: "Focus block",
        generated_at: "2026-10-17T12:00:00Z",
      },
      clock,
    ),
    true,
  );

  // Valid recommendation with future expiration
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-2",
        title: "Walk outside",
        generated_at: "2026-10-17T12:00:00Z",
        expires_at: "2026-10-17T16:00:00Z",
      },
      clock,
    ),
    true,
  );

  // Future generation timestamp rejected
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-future",
        title: "Invalid future recommendation",
        generated_at: "2026-10-17T15:00:00Z",
      },
      clock,
    ),
    false,
  );

  // Already expired recommendation rejected
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-expired",
        title: "Expired task",
        generated_at: "2026-10-17T10:00:00Z",
        expires_at: "2026-10-17T13:59:59Z", // 1s before clock
      },
      clock,
    ),
    false,
  );

  // Older than 24 hours rejected
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-stale",
        title: "Stale recommendation from yesterday",
        generated_at: "2026-10-16T13:00:00Z", // 25h ago
      },
      clock,
    ),
    false,
  );

  // Expiration before generation rejected
  assert.equal(
    isRecommendationValid(
      {
        id: "rec-inverted-exp",
        title: "Inverted expiration",
        generated_at: "2026-10-17T12:00:00Z",
        expires_at: "2026-10-17T11:00:00Z",
      },
      clock,
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// 3. Action Decisions Pure Handler (executeActionDecision)
// ---------------------------------------------------------------------------

test("executeActionDecision strictly validates UUID and decision format", async () => {
  const { client } = createMockSupabase();

  // Non-UUID input rejected
  const res1 = await executeActionDecision("not-a-uuid", "completed", client);
  assert.equal(res1.ok, false);
  assert.match(res1.message, /invalid action decision/i);

  // Loose non-strict UUID rejected
  const res2 = await executeActionDecision("12345678-abcd", "completed", client);
  assert.equal(res2.ok, false);
  assert.match(res2.message, /invalid action decision/i);

  // Invalid decision rejected
  const res3 = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "deleted",
    client,
  );
  assert.equal(res3.ok, false);
  assert.match(res3.message, /invalid action decision/i);

  assert.equal(UUID_STRICT_REGEX.test("11111111-1111-4111-8111-111111111111"), true);
});

test("executeActionDecision rejects unauthenticated caller", async () => {
  const { client, state } = createMockSupabase({
    user: null,
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /please sign in/i);
});

test("executeActionDecision rejects unavailable or closed action", async () => {
  const { client } = createMockSupabase({
    actionData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "completed", // Already closed!
    },
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /unavailable or already closed/i);
});

test("executeActionDecision fails when RPC returns error", async () => {
  const { client } = createMockSupabase({
    rpcError: { message: "database timeout" },
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /could not record the action/i);
});

test("executeActionDecision fails without success when readback returns null or error", async () => {
  const { client } = createMockSupabase({
    readbackData: null,
    readbackError: { message: "read connection reset" },
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /could not be confirmed/i);
});

test("executeActionDecision fails without success when readback returns unchanged status", async () => {
  const { client } = createMockSupabase({
    readbackData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "planned", // Status did not transition to 'completed'!
    },
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /could not be confirmed/i);
});

test("executeActionDecision succeeds only after matching owner-filtered readback confirms expected status", async () => {
  const { client, queryLog } = createMockSupabase({
    actionData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "planned",
    },
    readbackData: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
    },
  });

  const res = await executeActionDecision(
    "11111111-1111-4111-8111-111111111111",
    "completed",
    client,
  );
  assert.equal(res.ok, true);
  assert.match(res.message, /action recorded/i);

  // Check RPC params
  const rpcCall = queryLog.find((q) => q.type === "rpc");
  assert.ok(rpcCall);
  assert.equal(rpcCall.name, "record_meplus_action_decision");
  assert.deepEqual(rpcCall.params, {
    p_action_id: "11111111-1111-4111-8111-111111111111",
    p_decision: "completed",
  });

  // Verify owner filtering in both initial read and readback
  const actionReads = queryLog.filter((q) => q.table === "actions");
  assert.equal(actionReads.length, 2, "Must perform initial read and readback");
  for (const read of actionReads) {
    assert.ok(
      read.filters.some((f) => f.col === "user_id" && f.val === "user-web-1"),
      "Every action read must filter by authenticated owner user_id",
    );
  }
});


test("network exceptions never expose provider details or report a saved decision",async()=>{
 const {client,state}=createMockSupabase();state.getUserHandler=async()=>{throw new Error("PRIVATE_PROVIDER_DETAIL")};
 const result=await executeActionDecision("11111111-1111-4111-8111-111111111111","completed",client);
 assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes("PRIVATE_PROVIDER_DETAIL"));
});
