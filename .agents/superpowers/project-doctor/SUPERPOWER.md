---
name: project-doctor
description: Audit project health, agent readiness and context efficiency using evidence before proposing repairs.
---

# Project Doctor

1. Read the compact startup context, then inspect repository structure without dumping the whole tree into model context.
2. Run/inspect documentation consistency + agent-stack validation, documented build/test commands and current CI.
3. Check for stale handoff/memory, unclear commands, branch/release drift and missing project-specific skills.
4. Check that non-trivial work has a usable planning path, tests are meaningful rather than nominal, material frontend work has rendered-runtime plus visual-sanity verification, performance/analytics/localization contracts are defined when used, and production projects can identify the deployed revision, health signals and rollback/recovery path.
5. Use Code Hygiene for dead/unused code questions; Dependency Maintenance for upgrades; Graphify/search for change-impact navigation.
6. Check security tooling and sensitive boundaries only to the depth justified by the project.
7. Measure startup context with `scripts/context-budget.mjs`; if broad tasks repeatedly over-read files, sample a real packet with `scripts/context-packet.mjs` and reduce duplicate/irrelevant inputs before adding compression tooling.
8. Produce prioritized findings with evidence, impact and a concrete repair path.
9. Apply repairs only within the requested scope; avoid turning an audit into an unbounded rewrite.

The goal is fewer ambiguities, less repeated discovery and smaller working context without reducing verification quality.
