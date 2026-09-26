# Changelog

## [Unreleased]

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
