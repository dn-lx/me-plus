# ENG-007 verification evidence — 2026-10-07

## Scope and current head

PR: https://github.com/dn-lx/me-plus/pull/67 → `dev`  
Current verified head: `48d2b2cc4ab43eed27712d69333f2ecfc56e2e17`  
Patch candidate: `supabase/patches/eng_007_routing_guardrails.sql`  
Shared-runtime deployment status: **candidate NOT applied**; current live core remains Edge Function 25 / `gateway-v1.17.0` with bootstrap `v3`.

## Fixed and verified

- Dependency gate: the prior critical `shell-quote` GHSA-pqg4-j6r4-53mv failure is fixed via a narrow override to patched `>=1.11.0`; current Security workflow is green. The advisory is not ignored.
- Provenance: repository gateway source now matches the live v1.17.0 contract. Repository migration filenames/content now match the five actually applied ENG-007 migrations; no applied migration was replayed.
- Guardrail behavior: explicit language beats broad topic hints; matching uses normalized whitespace and word boundaries; explicit ENG issue keys route to exact lookup; candidates are compact; missing/inactive/invalid/stale spec registrations cannot falsely claim a fast path; ambiguity and connector/retry policies are bounded.
- Bootstrap compatibility: staged patch is based on live `bootstrap-context-v3`, keeps known routes state-free by default, forwards resolver `fallback_reason` / `fallback_policy`, keeps stale/broken routes scoped, and caps fallback discovery to two calls.
- Isolated PostgreSQL run https://github.com/dn-lx/me-plus/actions/runs/37590204039: **64 passed, 0 failed**, replacement replay passes, production access false.
- Current-head Security, Runtime, Version and Agent Stack workflows pass. CodeRabbit combined status is success; no formal GitHub review object is recorded.

## System-wide read-only acceptance

At 2026-10-07 07:54 UTC:
- database reachable;
- live routing regression **12/12**;
- zero invalid/unready indexes;
- zero blocked backends;
- zero transactions idle in transaction for more than five minutes;
- enabled scheduler health is entirely healthy / healthy-idle / healthy-waiting / healthy-unmetered.

All currently referenced fast-path specs are active, have valid Drive references and are within the staged 30-day revalidation window.

Advisors also exposed separate, pre-existing security work outside ENG-007: the medication/supplement adherence SECURITY DEFINER RPC is callable by anon/authenticated, and `get_health_context` is SECURITY DEFINER callable by authenticated while accepting a caller-supplied user id. These findings are not caused by the ENG-007 patch and must be handled separately.

## Still unverified / release gates

- The current audit window contains four gateway requests, all `gateway-v1.15.0`; it contains no v1.17 `response_bytes` samples. No v1.17 end-to-end p50/p95 or observed tool-call reduction is claimed.
- The guardrail patch is not a generated migration because this agent environment does not have the Supabase CLI. Generate it with the installed CLI in the approved release workflow; never invent a timestamp or ad-hoc apply it to shared production.
- Merge to `dev` is authorized separately. Production still requires explicit approval for the specific reviewed `dev → prod` release.
- Remote connector availability is not proven by local registry validity. Connector failure behavior remains bounded policy plus isolated contract tests until exercised through the reviewed runtime.
