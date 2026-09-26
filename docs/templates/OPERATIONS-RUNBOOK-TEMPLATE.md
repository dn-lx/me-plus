# Operations Runbook

Use for a project with production runtime/data. Store only non-secret identifiers.

## Runtime environments

| Environment | Code source | URL/service | Data/auth target | Flags/analytics/observability |
| --- | --- | --- | --- | --- |
| Local | TODO | TODO | TODO | TODO |
| Preview/staging | TODO / Not used | TODO | TODO | TODO |
| Production | `prod` / adapted production branch | TODO | TODO | TODO |

## Deployment verification

- Intended release SHA/build:
- How to verify deployed SHA/build:
- Health/readiness check:
- Critical smoke journeys:
- Observability/log checks:
- External dependency/config checks:

## Rollback

- Rollback trigger:
- Last-known-good source:
- Application rollback:
- Feature/config rollback:
- Data/schema rollback constraints:
- Authorization required:

## Data recovery

- Backup provider/scope:
- Retention/recovery point:
- Restore procedure/reference:
- Last restore/recovery verification:
- Irreversible operations:

## Observability

- Error monitoring:
- Availability/health:
- Performance:
- Jobs/queues/cron:
- Critical integrations:
- Alert destination/owner:

## Incident minimum record

- Start/time detected:
- Affected environment/users/flows:
- Current revision/config:
- Containment/rollback action:
- Evidence/logs:
- Recovery verification:
- Follow-up/prevention:
