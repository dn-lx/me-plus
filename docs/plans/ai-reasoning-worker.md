# Me+ AI Reasoning Worker

**Status:** production runtime deployed; end-to-end acceptance blocked on OpenAI API credit balance.

## Architecture

`Supabase pg_cron -> deterministic scheduler gate -> scheduler_dispatches -> me-plus-reasoning-worker -> OpenAI Responses API -> strict structured decision -> deterministic Supabase validation/persistence -> future external adapters`

Supabase remains authoritative for clock, state, deterministic facts, dates, recurrence, deduplication, permissions, safety constraints and persistence. The model only performs bounded interpretation/prioritisation and proposes low-risk actions.

## Production implementation — 2026-09-28

- Edge Function: `me-plus-reasoning-worker`, production version 2, `verify_jwt=false` with a public wake surface that ignores caller-supplied identity and claims only canonical database dispatches through service-only RPCs.
- Atomic dispatch claim uses `FOR UPDATE SKIP LOCKED`; stale claims may be recovered after 10 minutes.
- Purpose-specific context function: `get_ai_reasoning_context`; only `service_role` may execute it.
- Model default: `gpt-5.6-luna`, Responses API, `reasoning.effort=low`, Structured Outputs JSON schema, `store=false`.
- Output guard: maximum three recommendations; external/irreversible/high-impact actions are outside the contract; any generated action is `proposed`, low-risk, reversible, deduplicated and not externally executed.
- Cost ledger: `ai_usage_events` records tokens, model metadata, pricing snapshot and estimated USD cost.
- Wake path: scheduler invokes the Edge Function via `pg_net`; recovery cron `meplus-ai-reasoning-worker-retry` runs every five minutes.
- Wake URL and publishable key are stored in Supabase Vault; the OpenAI key remains an Edge Function secret and is never stored in Git.
- Todoist remains a separate adapter and is not implemented by this worker.

## Acceptance attempt

The existing 23:00 Europe/Berlin dispatch `4b1ebb5b-e2c3-488e-8d00-dd8879902def` was used as the live acceptance item.

1. Worker v1 successfully claimed the dispatch but failed before OpenAI because the existing Personal State view was not directly readable through the service-role Data API path. A purpose-specific `SECURITY DEFINER` context function fixed that boundary.
2. Worker v1 also had an error-handler `.catch()` misuse on a Supabase query builder; worker v2 fixed it.
3. Worker v2 reached the OpenAI API. OpenAI returned HTTP 429 with code `credit_balance_exhausted` before any model inference.
4. Non-retryable billing/credential errors now transition dispatches to `blocked`, so the recovery cron will not repeatedly call OpenAI or consume retry attempts.
5. The acceptance dispatch is currently `blocked`, attempts=2, with the authoritative OpenAI billing error preserved in `last_error`.

## Remaining acceptance step

Add credit to the OpenAI API billing account. Then explicitly release/wake the blocked dispatch and verify:

- OpenAI structured decision succeeds;
- dispatch becomes `completed`;
- `ai_usage_events` contains real token counts and estimated cost;
- recommendation/action outputs, if any, pass deterministic validation and deduplication;
- a no-work wake is idempotent;
- security/performance advisors have no new material findings.

Do not merge this branch as fully accepted until that live inference step passes.
