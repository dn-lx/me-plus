# Skill Index

Load this file only when the correct specialist path is not already obvious. Do not preload the skill catalog at session start.

| Trigger | Skill |
| --- | --- |
| Broad/stalled/end-to-end task | `task-routing` |
| Resume interrupted work | `task-continuity` |
| Choose host/model/parallelism | `execution-routing` |
| New project from starter | `project-bootstrap` |
| External MCP/connector work | `mcp-usage` |
| Current third-party API/SDK docs | `context7` |
| Code relationships/change impact | `graphify` |
| Context/token reduction | `memory-context` |
| Non-trivial delivery plan | `implementation-planning` |
| Test harness/fixtures/regression coverage | `test-engineering` |
| Focused UI bug: contrast/alignment/overflow/clipping/responsive | `frontend-verification` |
| Major design/redesign/UX direction | `design-stack` |
| Runtime animation beyond CSS | `motion-runtime` |
| Accessibility/screenshot regression | `accessibility-visual-regression` |
| Performance regression/budget | `performance-budget` |
| Analytics/events/flags | `analytics-contract` |
| Auth/secrets/privacy/trust boundaries | `security-boundary-review` |
| Risk-based checks | `quality-gates` |
| Production readiness | `release-readiness` |
| Branch/release mechanics | `release-workflow` |
| Dead/unused code | `code-hygiene` |
| Dependency upgrades/advisories | `dependency-maintenance` |
| Measured optional compression | `headroom-pilot` |
| Starter placeholder project knowledge | `project-template` |

## Fast-path rule

If the task clearly matches one row, load that skill directly. Use `task-routing` only when the outcome is broad or ambiguous.

For a focused visual defect, start with `frontend-verification` and the affected source/styles. Do **not** load Taste, UI/UX Pro Max, Impeccable or Motion unless the task actually changes visual direction or interaction design.
