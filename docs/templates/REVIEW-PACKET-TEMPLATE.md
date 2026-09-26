# Independent Review Packet

Use this template when handing material work to an independent reviewer.

## Requirement

What was requested? Include acceptance criteria, not the implementer's reasoning transcript.

## Risk

- Risk level:
- Sensitive boundaries touched:
- External systems touched:
- Runtime/environment targeted:

## Changed surface

- Branch:
- PR:
- Changed files/modules:
- Important architecture/contracts:

## Evidence

- Tests:
- Build/type/lint:
- Browser/runtime (including console/network where relevant):
- Performance budget:
- Analytics contract/wiring:
- Accessibility/visual:
- Security checks:
- Migration/data/rollout compatibility checks:
- Deployment/recovery checks:
- Anything not run:

## Reviewer focus

Ask the reviewer to independently inspect:
- correctness against the requirement,
- regressions/edge cases,
- authorization/security/privacy boundaries,
- data compatibility,
- failure handling,
- maintainability only where it materially affects correctness.

## Findings format

For each real finding:
- severity: critical / high / medium / low,
- file/area,
- concrete failure/risk,
- evidence,
- recommended correction.

Do not manufacture findings to appear useful. If no material issue is found, say so and state what was actually reviewed.
