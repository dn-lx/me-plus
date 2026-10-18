# ME2-HEALTH-023 — Seven-day high-frequency health compaction

Owner explicitly selected seven days of raw health data followed by compaction on18October. Existing rows are within seven days, so no immediate deletion is expected. Scope is Health Connect heart-rate/oxygen high-frequency samples; sparse domain facts, corrected rows and relationally referenced evidence remain canonical. No unrelated retention class, provider, bank or production application deployment changes.

## Contract and delivery
- For opted-in existing single-owner profile only, compact complete local-day windows older than seven days; both measurement/provider-modification and receipt times must be old. New profiles are not automatically opted in.
- Keep versioned daily descriptive summaries per owner/source/app/device/metric/unit/timezone. Separate usable/rejected counts; exclude rejected values from extrema/mean. These are sample statistics, not inferred clinical measures or daily step totals.
- Replace verbose provider payload/revision/observation rows with packed normalized numeric/provenance receipts. Private receipts retain source identity hashes, latest revision key, original row IDs, timestamps, quality and numeric contribution. They contain no raw provider payload, prompt or external archive. This supports deduplication and replacement of late revisions without inflating history.
- Source-wide locking and selected-row locks serialize ingestion/compaction. Existing correction markers/history and all foreign-key references outside the candidate observation prevent deletion. Write compact receipt and summary, then delete only selected protected/locked raw identities and revision copies in one transaction.
- Atomic ingestion skips same/stale compacted revisions; newer revisions remove their old summary contribution and follow normal ingestion. Bounded health context adds labeled summary history and conservative latest-value fallback for days8–14.
- Private daily03:15UTC job uses each profile timezone and bounded work. Public policy/summary tables have owner SELECT RLS only; writes and packed receipts remain service-only.
- Numeric roundtrip repair uses the exact validated double cast from ingestion, so harmless JSON precision differences do not strand valid unit-alias rejections. No range/safety gate is weakened.

## Verification and rollout
Isolated PostgreSQL17.6 fixtures reproduce alias rejection and exercise compaction counts, source/quality separation, protected corrections/FKs, recent receipts, idempotence, replay dedup, newer revisions, context compatibility and denied client execution. Independent security review and actual-head hosted checks precede shared-database application. Inspect live catalog, run bounded maintenance once and verify no unexpected deletions while all current rows are recent. Retain production application lock. Disable policy/cron to stop future compaction; compact normalized evidence can reconstruct observations, while deleted verbose raw payloads are not retained beyond the approved policy.


## Reviewed and live evidence —18October
- Independent review preserved latest usable quality/confidence, protected both raw and observation FK children, rejected NULL limits and added durable source-specific success/failure audit plus scheduler heartbeat. Expanded isolated PostgreSQL checks passed at f923dbea47ab9f455953954ab0b437d9a5208bc1.
- Shared DB numeric repair applied as20261018110635; compatibility followup removed all3remaining alias rejections while retaining raw payloads. Compaction applied as20261018110638; opted-in owner policy raw_days7, daily03:15UTC cron active, client execute denied. Bounded initialrun:0compacted,0failed,7,644raw records unchanged; source audits and no-op heartbeats verified.
- Additional reference-race hardening requires READ COMMITTED and rechecks FKs in a distinct statement after acquiring parent row locks. A deterministic multi-session baseline must reproduce cascade loss on the prior implementation, then the followup must retain raw/observation/cascade child for both reference types. Repeatable-read calls fail closed. Followup is pending exact-head hosted verification before deployment.
- GitHub source filenames retain CLI provenance; live ledger timestamps differ because connector assigns application time. Do not replay unrelated historical migrations.
