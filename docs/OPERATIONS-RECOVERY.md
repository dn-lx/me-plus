# Operations and Recovery

Load this document for projects with a deployed runtime, persistent data, production integrations or meaningful operational risk.

The goal is to make a release recoverable. A successful merge is not proof that production is healthy.

## Runtime environment identity

Branches are code-promotion lanes, not proof of runtime or data isolation.

For each relevant runtime, record non-secret identifiers for:
- deployed URL/service/application,
- source branch/build/revision,
- database/auth/storage target,
- analytics/observability project,
- feature-flag environment,
- external integrations that differ by environment.

Before a sensitive write or production verification, confirm the actual runtime/account/project rather than inferring it from the branch name.

## Deployment verification

A production release is verified only when evidence corresponds to the deployed artifact.

Check as applicable:
1. deployed revision/build maps to the intended release SHA,
2. deployment completed without platform errors,
3. health/readiness endpoint or equivalent responds,
4. one or more critical smoke/user journeys work in the deployed runtime,
5. new errors/log spikes are not evident in configured observability,
6. critical external dependencies/config/feature flags resolve as expected.

Do not report deployment success solely because the GitHub PR merged or the hosting job returned green.

## Rollback and recovery

Before a risky release, know:
- what signal triggers rollback,
- whether rollback means application version, feature flag, config, data migration, or several coordinated actions,
- who/what is authorized to execute it,
- whether rollback is actually safe after data/schema changes,
- the last known-good revision/configuration.

Prefer reversible changes and feature-flagged rollout where the project architecture supports them.

## Database and schema changes

For material schema/data changes:
- document deploy/migration order,
- check old/new application compatibility during rollout,
- prefer expand → migrate/backfill → switch → contract for changes that cannot be atomic,
- make migrations idempotent or clearly one-shot,
- define backup/restore or recovery point when data loss is plausible,
- test negative/failure/retry behavior,
- never describe application rollback as sufficient if the data change is irreversible.

## Backup and restore

If the product depends on persistent/valuable data:
- document what is backed up and by whom/provider,
- record retention/recovery expectations without storing secret credentials,
- know the restore procedure and target,
- periodically verify restoration or provider recovery guarantees to the level justified by risk.

A backup that has never been restorable is not strong recovery evidence.

## Observability and alerts

Record the minimum signals needed to decide whether production is healthy:
- errors/exceptions,
- availability/health,
- latency/performance where material,
- background jobs/queues/cron where material,
- payment/email/webhook failures where material,
- data integrity/business-critical failures where detectable.

Alerting should identify an owner/team or operational destination, not depend on one agent chat.

## Incident mode

When production is degraded:
1. confirm scope/environment and preserve evidence,
2. stop repeated destructive writes/retries,
3. stabilize impact first (rollback/disable/contain when safe),
4. record exact revision/config/external state,
5. diagnose from logs/metrics/reproduction,
6. make the smallest safe repair,
7. verify recovery in production,
8. record follow-up/prevention work separately.

Urgency does not bypass authorization, production branch policy or data-safety boundaries.

## Project runbook

For production projects, adapt `docs/templates/OPERATIONS-RUNBOOK-TEMPLATE.md` or maintain equivalent project documentation. Keep secrets out of it.
