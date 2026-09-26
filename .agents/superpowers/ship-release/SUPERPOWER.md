---
name: ship-release
description: Prepare a verified dev-to-prod release while preserving the repository release contract.
---

# Ship Release

1. Confirm the candidate is the repository's current `dev`; no feature branch may target `prod`.
2. Load `release-readiness` and `release-workflow`.
3. Review the complete dev→prod diff, version/changelog impact, migrations, environment changes and external-service changes.
4. Require all mandated checks and release evidence to be green/current for the exact candidate SHA.
5. Confirm the production runtime target, deployed-revision verification method, critical post-deploy smoke/health checks, observability signals and rollback trigger from `docs/OPERATIONS-RECOVERY.md` or the project runbook.
6. Create/update the dev→prod PR with a compact release summary and unresolved risk.
7. Preserve explicit human production approval. Do not auto-approve or bypass release guards.
8. After an approved merge, verify the deployed revision matches the release, run the documented critical production smoke/health checks and inspect required observability. A merged PR or green deploy job alone is not proof of a healthy release.
9. If critical post-deploy verification fails, contain/rollback/escalate according to the runbook rather than repeatedly retrying writes. Preserve a concise release/incident handoff.

Never use urgency to bypass the dev-only production rule.
