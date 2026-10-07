# ENG-007 verification evidence — 2026-10-07

## Scope and version

Code commit: `68e0af5162b329e94c0b3c53552a002d0a0ed109`.
PR: https://github.com/dn-lx/me-plus/pull/67 (draft, target dev).
Tested merge ref: `7437f59c1e308b3e33ad892635c7ac72cd4fe76e` (code commit above plus dev `a5a60a8dc5822c0b182107fae09dd756b0615a61`).
Patch: `supabase/patches/eng_007_routing_guardrails.sql`.
Deployment status: NOT applied to shared Supabase; NOT released to prod.

## Verified

- https://github.com/dn-lx/me-plus/actions/runs/37584524679 — routing / isolated PostgreSQL: success. Log output reports `passed: 54, failed: 0, production_access: false` twice, after initial application and replacement replay.
- Behavioral scope: 17 registered-domain fixtures, aliases/case/whitespace/punctuation, explicit intent beating broad topics, word-boundary rejection, specific engineering issue lookup, compact alternatives, ambiguity preserved despite result limit, missing/inactive/invalid/stale registry references, recovery after revalidation, input limits, function ACLs and an actual denied anonymous invocation.
- https://github.com/dn-lx/me-plus/actions/runs/37584524593 — runtime / workspace: success.
- Agent-stack and version validation passed for the code commit. Security Semgrep and Gitleaks passed.
- Tests use disposable PostgreSQL 17.6 with synthetic route/spec fixtures and no user records or live credentials. No production failure fixture was installed.

## Release blockers and unverified areas

- https://github.com/dn-lx/me-plus/actions/runs/37584524573 — dependency-audit failed. The audit reported critical `shell-quote` advisory GHSA-pqg4-j6r4-53mv through the React Native / react-devtools dependency tree; output reports affected versions >=1.8.4 <1.11.0, fixed >=1.11.0. This is an observed audit result, not a claim of exploitability in Me+. No dependency/lockfile changes were made by this follow-up. Resolve and verify separately; do not silence the audit.
- Android builder was queued at inspection, not verified. The new SQL patch has no Android code changes.
- Deployed gateway/migration history is newer than this PR's older gateway source. Reconcile before generating/applying the next migration or deploying the branch.
- The existing bootstrap consumer must preserve/forward actionable fallback reasons and avoid unnecessary broad/full context when registration revalidation is required. Isolated resolver tests do not prove complete bootstrap, network or connector recovery.
- Registration validation covers local canonical references, not remote Drive availability/permissions. The 30-day rule requests revalidation; it does not declare remote failure.
- Connector-failure fields express bounded caller policy; no external execution/authorization/retry behavior is claimed to have changed.
- No representative new-version gateway samples were found in the inspected last-24-hour audit window. No user-visible cold/resumed latency improvement, p95 reduction or measured tool-call reduction is claimed.
- Independent review, current-head CI, dev merge, approved dev-to-prod release and shared-runtime acceptance remain open. Do not conflate the earlier live bootstrap work with this staged follow-up.

## Improvement watch

The user-requested read-only Me+ Improvement Watch is enabled for daily review around 09:00 Europe/Berlin, meaningful-change notifications and a Monday digest. It complements the operational-health and document-drift watches. It reports at most three actionable recommendations, with evidence, benefit, smallest safe change, dependencies/risks, acceptance tests and one next-session instruction. Canonical observer policy is `improvement-watch-v1.0` in the existing Scheduler specification; compact source/policy references are stored on ENG-007. Creation/enabled state does not prove a future execution or notification receipt.
