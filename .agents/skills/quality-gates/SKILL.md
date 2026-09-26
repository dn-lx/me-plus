---
name: quality-gates
description: Choose efficient verification based on change risk without weakening evidence.
---

# Quality Gates

The real project must define exact commands in Project Memory and CI.

## Tier 1 — ordinary feature/fix PR into dev

Use fast deterministic checks relevant to changed behavior:
- syntax/type/lint where applicable,
- unit/integration tests,
- build/compile,
- targeted browser smoke test for UI changes,
- `frontend-verification` for material UI behavior/layout/interaction changes,
- accessibility and targeted visual-regression checks for material UI changes when configured,
- documented performance-budget checks when the change can materially affect user-perceived performance,
- analytics-contract verification when events, flags or experiments change,
- secret scanning,
- dependency/security checks relevant to the stack.

Use `test-engineering` when the test harness, fixtures or regression strategy itself must be added/repaired. Use CI concurrency/cancel-in-progress so obsolete runs do not waste resources.

## Tier 2 — sensitive change

For auth, permissions, secrets, payments, schema/data, tenant isolation, public APIs/webhooks/uploads, privileged functions, external writes or worker command execution:
- Tier 1,
- Security Boundary Review,
- allowed + denied/negative-path verification where practical,
- independent capable reviewer.

## Tier 3 — dev→prod release

Follow Release Workflow and Release Readiness:
- complete release diff,
- required checks green,
- migrations/env/external-service changes reviewed,
- critical user flows verified,
- frontend runtime/browser evidence reviewed for material frontend releases,
- accessibility/visual evidence reviewed for material frontend releases,
- performance budgets checked for performance-relevant releases,
- analytics contracts checked when instrumentation/flags changed,
- rollback/compatibility documented,
- production runtime/deployed-revision and post-deploy smoke/health verification defined for releases with a deployed runtime.

## Completion evidence

A material task is complete only when:
- the selected requirement/acceptance criteria are satisfied,
- required checks correspond to the **current final SHA**,
- runtime/browser/deployment evidence is current where required,
- no unresolved blocking review/security/data findings remain,
- required documentation/operational contracts are updated.

A green check from an earlier SHA is stale evidence after any later commit. Retrigger/re-run the required gate or report it as unverified; never carry an old green result forward.

## Efficiency

- deterministic tools answer deterministic questions,
- add tests that protect real behavior/regressions/security boundaries,
- do not run expensive release matrices on every tiny commit unless risk requires it,
- never weaken a test because a change made it inconvenient,
- report exact checks/results and anything not run; a generic “tests passed” claim without scope is not enough for material work.
