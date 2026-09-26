## Summary

<!-- Concise user-visible or engineering outcome. -->

## Why / requirement

- Task / requirement ID:
- Root cause / need:

## Task continuity

- Base branch: `dev`
- Working branch:
- Status:
- Last verified SHA (must match current head for final evidence):
- Next safe step if interrupted:

> For non-trivial work, keep task → branch → PR binding recoverable. An open branch alone is not an active-task signal.

## Verification

- [ ] Relevant tests passed for the current head SHA
- [ ] Build/type/lint checks passed where applicable
- [ ] Browser/runtime verification completed for material frontend changes, including contrast/alignment/overflow/clipping/theme sanity where affected
- [ ] Performance budget checked where performance is materially affected
- [ ] Analytics contract/wiring checked where instrumentation changed
- [ ] Final diff inspected
- [ ] Security boundary review completed if sensitive
- [ ] Documentation/memory updated if durable behavior changed

Evidence / commands (exact checks/results; use the verification evidence template for material work when useful):

```text
TODO
```

## Risk / rollback

<!-- Important risk, migration, external side effect, rollback path. -->

## Agent / review notes

- Implementer:
- Independent reviewer (if required):
- MCP/external writes performed:
- Remaining limitations:

## Version / release impact

- Release impact: none / patch / minor / major (explain).
- Changelog entry or reason none is needed:
- Compatibility/migration impact:
- [ ] Development-only change
- [ ] Requires later `dev → prod` release review
- [ ] After merge, verify temporary branch cleanup.
