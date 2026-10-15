import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = read("apps/web/app/today/page.tsx");
const controls = read("apps/web/app/today/action-controls.tsx");
const decisions = read("apps/web/app/today/action-decisions.ts");
const review = read("apps/web/app/review/page.tsx");

test("native Today is backed by canonical user-scoped Me+ actions", () => {
  assert.match(today, /from\("actions"\)/);
  assert.match(today, /eq\("user_id",\s*auth\.user\.id\)/);
  assert.match(today, /<ActionControls\s+id=/);
});

test("native action decisions require authentication and an ownership-scoped read", () => {
  assert.match(decisions, /auth\.getUser\(\)/);
  assert.match(decisions, /eq\("user_id",\s*user\.id\)/);
  assert.match(decisions, /rpc\("record_meplus_action_decision"/);
  assert.match(decisions, /revalidatePath\("\/today"\)/);
});

test("native execution controls offer canonical completion states", () => {
  for (const decision of ["completed", "partial", "skipped"]) {
    assert.match(controls, new RegExp(`value="${decision}"`));
    assert.ok(decisions.includes(`"${decision}"`));
  }
  assert.match(controls, /disabled=\{pending\}/);
});

test("native Daily Review derives execution from stored events, not inferred time", () => {
  assert.match(review, /from\("action_events"\)/);
  assert.match(review, /eq\("user_id",\s*auth\.user\.id\)/);
  assert.match(review, /event_type/);
  assert.match(review, /new Intl\.DateTimeFormat/);
});

test("native Today/Review source does not depend on Todoist", () => {
  for (const source of [today, controls, decisions, review]) {
    assert.doesNotMatch(source, /todoist/i);
  }
});
