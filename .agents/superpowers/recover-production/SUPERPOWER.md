---
name: recover-production
description: Stabilize and recover a degraded production runtime with verified environment identity, bounded writes, rollback/containment and post-recovery evidence.
---

# Recover Production

Use when an already-deployed production system is degraded, broken, misconfigured, or showing a material regression.

1. Read `docs/OPERATIONS-RECOVERY.md` and the project runbook; confirm the affected runtime/account/data target and current deployed revision/configuration.
2. Establish impact and preserve compact evidence from health checks, observability, logs and a minimal reproduction. Do not assume the newest code change is the cause.
3. Stop repeated destructive/retriable writes and choose the safest immediate containment: disable a feature/flag, pause a worker/integration, rollback a reversible change, or otherwise reduce impact within authorization.
4. Before rollback, verify whether schema/data/config changes make application rollback unsafe. Preserve recovery/backup constraints.
5. Diagnose the smallest supported cause using current source/runtime/provider evidence. Load `security-boundary-review` if trust/data/secret boundaries are involved and `frontend-verification` when the incident is UI/runtime-specific.
6. Apply the smallest authorized repair or rollback. Reconcile external state before retrying any write so an already-completed action is not repeated.
7. Verify the actual production runtime: deployed revision/configuration, critical smoke/health checks, relevant observability and the original failing path.
8. Record incident/recovery evidence, external writes, unresolved risk and follow-up/prevention work. Product improvements discovered during recovery become separate requirements rather than expanding the emergency repair.

Do not:
- bypass authorization or the production branch/deployment contract because the incident is urgent,
- keep retrying an identical failed repair,
- call production healthy solely because CI/deployment turned green,
- perform broad refactoring while stabilizing an incident.
