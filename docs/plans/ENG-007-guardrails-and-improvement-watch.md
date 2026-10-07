# ENG-007 follow-up: routing guardrails and improvement watch

Status: implementation candidate on existing PR #67, targeting dev; not deployed. The shared Supabase database is not a staging environment. No direct runtime deployment or prod merge is authorized by this PR.

## Verified live gaps (2026-10-07)

- `how many steps today` with the broad topic `daily` selects daily planning instead of health.
- Substring aliases match inside unrelated words; whitespace normalization does not collapse actual tabs/newlines.
- The prior bootstrap declares a fast path even when a required spec registration is absent/inactive; the resolver does not check registration validity.
- The prior resolver duplicates complete routing records across selected/matches.
- The bounded last-24-hour audit sample inspected contained only gateway-v1.15.0 requests; no new-version end-to-end speed claim is supported.

## Implementation and acceptance

`supabase/patches/eng_007_routing_guardrails.sql` is a patch candidate, not an applied or timestamp-invented migration. It preserves the resolver signature consumed by bootstrap, normalizes whitespace/word boundaries, prioritizes explicit intent over generic topics, routes explicit engineering issue keys to the exact issue read, summarizes alternatives, and stops fast-path selection when specs are missing/inactive/invalid or need age-based revalidation. A 30-day age is a revalidation request, not evidence of remote failure. Conflicting near-equal lexical intents retain bounded candidates instead of silently dropping one.

The isolated PostgreSQL workflow exercises aliases, specificity, ambiguity, missing/inactive/stale registrations, invalid references, bounded input, denied roles, compact output and replay. It has no production credentials. Connector failure fields specify a bounded caller policy; they do not execute or prove external connector recovery.

## Review and rollout

1. Inspect the isolated PostgreSQL CI result on this exact commit and resolve failures.
2. Review bootstrap consumer compatibility and reconcile deployed-vs-branch migration/gateway provenance; prior live changes were not all mirrored to this branch.
3. Generate a migration using the installed Supabase CLI `supabase migration new eng_007_routing_guardrails`, then copy the reviewed patch into that generated file. Do not rewrite old applied migrations.
4. Follow focused branch -> dev -> explicitly approved dev-to-prod promotion, including reviewed shared-database application. Roll back by restoring the verified prior function definitions, not by dropping user data.
5. Measure actual cold/resumed gateway and user-visible latency, sample counts, payload bytes and observed calls. Single SQL timings and declared budgets are not end-to-end latency or observed calls. Keep ENG-007 open until these acceptance conditions are met.

## Independent improvement watch

A separate user-requested ChatGPT condition watch was enabled on 2026-10-07 for daily review around 09:00 Europe/Berlin and a Monday digest. It is read-only, complements the existing operational-health and documentation watches, and reports at most three prioritized, evidence-linked improvements with a smallest patch and acceptance test. It reviews the whole setup progressively, does not mutate infrastructure/data/docs/issues, and provides one copy-ready next-session instruction. Canonical behavior belongs in the Scheduler Drive specification; dynamic execution/delivery evidence remains on the automation platform. Future execution and push/email delivery are not proven by task creation.
