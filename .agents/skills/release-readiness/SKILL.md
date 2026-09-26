---
name: release-readiness
description: Review a dev→prod release candidate for correctness, security, external changes and rollback readiness.
---

# Release Readiness

Before a production release:

1. Confirm PR head is `dev`, base is `prod`, and required production approval is present.
2. Review complete release diff for unrelated/unfinished work.
3. Confirm required syntax/unit/integration/browser/security/dependency checks passed for the current release-candidate SHA; older-SHA green checks are stale.
4. For material frontend releases, confirm rendered-runtime verification covered the documented critical flow/viewports, visual-sanity contract (contrast/alignment/overflow/clipping/theme states where affected) and relevant console/network health.
5. Confirm documented performance budgets passed when the release can materially affect user-perceived performance.
6. Confirm analytics contracts/taxonomy and privacy-safe wiring were reviewed when instrumentation/flags changed.
7. Review migrations, environment variables, redirects/headers and external-service changes; for schema/data changes confirm deploy order, old/new compatibility, idempotency/one-shot behavior and recovery constraints.
8. Confirm the intended production runtime/environment/account identifiers, how the deployed revision will be matched to the release SHA, and which post-deploy health/smoke checks will prove the release.
9. Confirm observability is ready to detect material regressions and define the rollback/containment trigger.
10. Confirm backup/restore or recovery-point expectations where data loss is plausible; do not call application rollback sufficient for irreversible data changes.
11. Record rollback path and irreversible operations.
12. Prepare a concise release summary using `docs/templates/RELEASE-SUMMARY-TEMPLATE.md` for material releases.
13. Report exact evidence and unresolved risks.

This skill reviews readiness; it does not authorize production deployment.
