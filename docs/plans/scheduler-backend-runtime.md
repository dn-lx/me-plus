# Me+ Backend Scheduler Runtime Plan

**Task:** Move the Me+ Hourly scheduler clock/gate and failure watchdog off ChatGPT Scheduled Tasks and onto Supabase backend infrastructure.

## Outcome

- Supabase `pg_cron` owns the exact hourly scheduler clock and the independent :15 health watchdog.
- The backend records durable invocation/terminal health, evaluates the existing deterministic gate, and materializes due canonical routine actions idempotently.
- Work that requires external execution or AI reasoning is durably queued instead of being silently lost.
- ChatGPT Scheduled Tasks are no longer the authoritative scheduler host.
- Existing Todoist execution semantics remain canonical, but backend Todoist mutation is not claimed until a server-side Todoist credential/integration exists.

## Verified current state

- Both the Hourly ChatGPT task and its same-substrate watchdog were auto-paused before their first Supabase call.
- Supabase project `wbqnctrvxohxwiaignhg` has pg_cron 1.6.4, pg_net 0.20.4, and Supabase Vault.
- Existing lifecycle functions include `me_scheduler_probe`, `scheduler_materialize_routine_action`, scheduler run/lease/heartbeat helpers, and versioned scheduler policy.
- Supabase Vault currently contains no secrets, so there is no backend Todoist credential to reuse.
- Repository migration provenance is restored through the scheduler audit migrations merged by PR #25.

## Implementation

1. Add a durable backend dispatch table for work that still needs AI/external execution.
2. Add a private hourly backend function that:
   - records invocation;
   - validates active policy;
   - runs the deterministic probe;
   - uses existing run/lease/idempotency helpers;
   - materializes due routine actions;
   - queues external/deep work;
   - finishes the run and releases the lease.
3. Add a private independent watchdog function that checks:
   - cron jobs are active;
   - Hourly heartbeat is within tolerance;
   - failed runs;
   - stale pending dispatches.
4. Schedule both functions with pg_cron at minute 00 and minute 15.
5. Publish scheduler policy version 1.14-draft with Supabase pg_cron as the authoritative clock/watchdog substrate.
6. Verify manual invocation, idempotent retry, cron registration, heartbeat/run-log state, dispatch queue behavior, RLS/security, and advisors.
7. Disable the unreliable ChatGPT Hourly/watchdog automations after backend acceptance passes.
8. Synchronize the canonical Drive Scheduler specification and engineering issue register.

## Security / rollback

- No secrets are added to Git.
- The new dispatch table uses RLS; cron/private functions are not granted to anon/authenticated roles.
- External Todoist mutation is not attempted without an explicit backend credential.
- Rollback: unschedule the two Me+ cron jobs and retire policy 1.14-draft; existing canonical actions/history remain intact.
