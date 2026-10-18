# ENG-007 follow-up: routing guardrails and system-wide acceptance

Status: verified candidate on PR #67 targeting `dev`; shared-runtime guardrail deployment is still pending the normal release gate.

## Implemented on the PR

- Reconciled source to live gateway Edge Function 25 / `gateway-v1.17.0` and exact applied ENG-007 migration history.
- Fixed the `shell-quote` security audit blocker with a patched-version override, without suppressing the advisory.
- Added deterministic intent precedence, real-whitespace and whole-word matching, direct ENG issue lookup, compact candidates, local spec-registration validity/revalidation and conservative ambiguity.
- Preserved live bootstrap v3 semantics and propagated bounded fallback reason/policy so stale/broken registrations remain scoped instead of causing broad rediscovery.
- Expanded isolated coverage to 64 assertions including bootstrap state scope, ambiguity, stale/broken registration fallback, service-only ACLs and replay.

## Verified

- Routing guardrail CI: 64/64 passed, no production access.
- Security / Runtime / Version / Agent Stack: green on the current head.
- Live routing regression: 12/12.
- System-wide read-only health: no current scheduler failure, invalid index, blocking backend or long idle transaction attributable to this change.
- All active routed spec registrations currently satisfy the staged local readiness/revalidation check.

## Release path

1. Merge PR #67 to `dev` once the current head remains green.
2. Generate a real migration from the reviewed patch using `supabase migration new eng_007_routing_guardrails` in an environment with the installed CLI; do not fabricate a migration version.
3. Review the resulting `dev → prod` release and obtain the user's explicit approval for that specific release before any production merge/shared-runtime application.
4. After deployment, collect representative cold/resumed v1.17 samples and report comparable sample count, p50/p95, payload bytes, fallback rate and observed call counts.
5. Keep ENG-007 open until production guardrails and end-to-end measurements are verified.

## System-wide findings outside ENG-007

The improvement itself does not explain current system-health failures. Separate security-advisor findings require their own bounded remediation: public execution of the medication/supplement SECURITY DEFINER write RPC, authenticated execution of the SECURITY DEFINER health-context read RPC, and leaked-password protection disabled. Keep these separate from ENG-007 so routing work does not widen scope or mask security ownership.
