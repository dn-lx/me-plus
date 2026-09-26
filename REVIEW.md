# Review Rules

Use these rules for automated and human pull-request review.

## Review priority

Focus on material issues, in this order:

1. correctness and behavioral regressions,
2. security, authorization, secrets and privacy boundaries,
3. data loss, migration and compatibility risks,
4. broken error handling or negative paths,
5. missing or weakened tests for changed behavior,
6. performance/reliability problems with concrete impact,
7. accessibility regressions for affected user interfaces,
8. repository policy violations that can cause unsafe delivery.

Do not spend review bandwidth on formatting or preferences already enforced by deterministic tooling.

## Evidence contract

Review the original requirement, implementation plan when one exists, final diff, relevant source/tests, project rules and deterministic check results. Do not rely on the implementer's full reasoning transcript.

For material work, evidence should identify exact checks/results and the reviewed revision. Check results must belong to the current reviewed SHA; an earlier green run is not current evidence after later commits. For affected surfaces, also inspect rendered frontend evidence—including contrast, alignment, spacing, overflow, clipping, overlap and affected theme/state sanity—plus performance-budget results and analytics-contract/privacy evidence rather than accepting generic “verified” claims.

A finding should identify:
- the concrete file/behavior,
- the failure mode,
- why it matters,
- the smallest safe correction or verification step.

Avoid speculative findings that cannot be tied to the changed code or a real project invariant.

## Repository invariants

- Ordinary work targets `dev` from a focused feature/fix/chore branch.
- Only `dev` may be promoted to `prod`, with explicit production approval.
- Do not weaken tests, validation, authorization, secret handling, accessibility or performance budgets to make CI pass.
- Material frontend changes require rendered-runtime evidence; source inspection alone is insufficient.
- Analytics changes must preserve privacy boundaries and remain non-authoritative for transactional behavior.
- External writes and privileged operations require the same trust-boundary review defined in `AGENTS.md`.
- Documentation that represents an operational contract must change when that contract changes.

## Review completion

After confirmed findings are repaired, rerun the relevant deterministic checks and inspect the final diff again. A clean automated review never replaces required CI or production approval.
