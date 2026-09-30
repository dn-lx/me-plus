# Changelog

## [Unreleased]

### Added
- Me+ password sign-in and a Connect N26 page for starting the read-only authorization from the browser.
- Versioned Android APK distribution: Android is built and verified on the designated Windows build host, then the verified APK is staged as a static download in the Netlify web deploy. Netlify remains web-only and never compiles Android.

### Fixed
- N26 authorization callbacks return to the configured site origin on Netlify branch deploys.

## [0.3.2] - 2026-09-30

### Added
- Incremental Health Connect Changes API ingestion so automatic runs upload only new or updated records instead of rescanning the full seven-day window.
- Immediate catch-up when Me+ becomes active or the phone signs in, plus a one-minute foreground poll while the app remains open.
- Durable change-token replay semantics: a token advances only after the corresponding Me+ upload is acknowledged, with a seven-day bootstrap fallback when no token exists or the token expires.
- A manual Sync now action that uses the same incremental cursor instead of uploading a diagnostic seven-day scan.

### Changed
- Android app metadata advances to Me+ 0.3.2 / versionCode 5.

## [0.3.1] - 2026-09-29

### Fixed
- Health uploads validate acknowledgements, abort timed-out requests, retry bounded transient failures, and refresh the session for each batch.
- Heart-rate payloads retain sample/provider context without repeating the full sample series.
- Provider revision keys use fixed-size SHA-256 digests.
- Health ingestion uses a server-only source-serialized database transaction so retries cannot overwrite newer revisions; failures roll back health writes while retaining attempt history and manual corrections.
- Health Connect uploads now use 50-reading mobile batches to avoid oversized backend lookup requests.
- The health ingestion API limits a single request to 100 readings.
- Health ingestion preserves provider revision history, resumes incomplete equal revisions, and selects the newest provider revision deterministically.
- Android release builds use verified short native dependency paths, Expo-compatible versions and checksum-pinned Ninja on the designated Windows runner.
- The standalone installer retains the previous ARM64 target and verifies its embedded JavaScript bundle, version, signing identity and architecture before publication.

## [0.3.0] - 2026-09-28

### Added
- Persistent Me+ Supabase sign-in on Android so the phone can authenticate health uploads to the canonical user account.
- Full Health Connect pagination across the seven-day scan window instead of stopping at the first 1,000 records.
- Health Connect mapping for heart rate, resting heart rate, oxygen saturation, sleep duration, steps, exercise duration, active calories, total calories and weight.
- Batched authenticated phone-to-Me+ health ingestion grouped by original Health Connect data origin, preserving source package, device metadata and raw source payload in `raw_events`.
- A third Health Connect action that uploads the scanned readings to Me+ and reports created/updated records and source-origin counts.

### Changed
- Expanded the shared health ingestion contract and backend validator to accept the record types confirmed by physical-device validation.
- Android app metadata now targets Me+ 0.3.0 with versionCode 3.

## [0.2.0] - 2026-09-27

### Added
- Initial runnable Me+ web and mobile runtime scaffold with shared contracts and Supabase client/server boundaries.
- Read-only N26 Open Banking integration through Enable Banking, including connection, callback, synchronization, provenance, consent, account and transaction ingestion.
- Public Me+ privacy and terms pages for the personal read-only banking integration.
- Netlify deployment configuration with explicit Next.js runtime support.

### Fixed
- Netlify pnpm bootstrap compatibility by moving builds to Node 24 and using Netlify-managed dependency installation.
- pnpm workspace catalog dependency specifiers so monorepo dependencies resolve correctly.
- TypeScript build errors in N26 pagination options and health-ingestion unit narrowing.
- Netlify branch deployments returning 404 by enabling the Next.js runtime adapter.

## [0.1.2] - 2026-09-26

### Fixed
- Bootstrap now rejects custom branch names until the full workflow/branch migration is performed, preventing policy and CI guard drift.
- The copied-project acceptance test verifies strict placeholder validation after project identity and requirements are filled.

### Changed
- Documented the bootstrap command and required manual setup steps.
- Pinned Semgrep and pip-audit versions and require a committed npm lockfile instead of generating one during the dependency audit.

## [0.1.1] - 2026-09-26

### Changed
- Strengthened agent token/cost discipline with explicit retrieve-before-load, bounded subagent, smallest-capable-model, milestone-compaction and cost-to-correct-completion guidance, including richer usage telemetry.

## [0.1.0] - 2026-09-25

### Added
- Question-specific documentation authority model so current source facts cannot silently override accepted intended requirements (or vice versa).
- Documentation map plus deterministic documentation consistency validation, including broken internal references, skill/doc index coverage, stale branch terminology and optional strict-project placeholder checks.
- Operations/recovery guidance, runbook template and production-recovery Superpower covering runtime identity, deployed-revision proof, production smoke/health, migrations, observability, rollback and backup/restore.
- Compact runtime-environment and localization contracts for project bootstrap and verification.
- Focused frontend visual-sanity verification for contrast, alignment, spacing, overflow, clipping, overlap and theme/state defects, plus a reusable visual-QA packet.
- On-demand skill index and task-context packet measurement, with an explicit budget for always-loaded `AGENTS.md` to reduce repeated token consumption.
- Implementation-planning, test-engineering, rendered frontend-verification, performance-budget and analytics-contract capabilities with reusable implementation, verification and analytics templates.
- Unified frontend design routing: Taste Skill for creative direction, UI/UX Pro Max for structured design intelligence, Impeccable for critique/polish, Motion for justified runtime animation, with accessibility/visual regression kept as independent evidence.
- Stable CI check names for branch-ruleset enforcement.
- Reusable `docs/REQUIREMENTS.md` template for ordered requirements, issues, roadmap items, acceptance criteria, completion checkboxes and verification evidence.
- Curated CLI agent baseline (Claude Code, Codex CLI, Gemini CLI, OpenCode), shared `REVIEW.md` guidance, a local CLI doctor, and a lean Claude efficiency profile covering Ponytail, Superpowers, Code Review, optional claude-mem and optional Obsidian skills.
- Agentwise + modelwise execution routing with single-agent fallback, multi-agent isolation rules and a provider-neutral routing profile template.
- Progressive context loading, outcome-oriented Superpowers, task routing and a startup-context budget guard to reduce repeated token/context expenditure.
- Explicit Claude/Gemini context imports, Claude skill discovery adapters, drift checks and host setup/acceptance instructions.
- Initial versioned starter baseline: shared agent instructions, quality and security workflows, context and design skills.
- GitHub-native merged-branch cleanup guidance, task/branch/PR continuity, and semantic version validation.

### Changed
- Security review now covers session/token lifecycle, public ingress/webhooks, replay/abuse/idempotency, XSS/CSRF/CORS/SSRF, uploads and sensitive-data lifecycle boundaries.
- Test engineering now explicitly addresses flaky tests, deterministic time/randomness/network state, concurrency/races and retry/partial-failure behavior.
- Final task verification now runs after the idle handoff is part of the merge candidate; any later commit invalidates earlier green-check evidence.
- Execution routing documentation is provider-neutral by default instead of assigning persistent vendor roles.
- Dependency-maintenance branch instructions now follow the canonical `dev → prod` workflow.
- Removed overlapping in-house frontend-design, design-taste and motion-design skills, and retired the Awesome Design catalogue after UI/UX Pro Max covered that structured design-intelligence role more broadly.
