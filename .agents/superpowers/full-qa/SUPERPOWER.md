---
name: full-qa
description: Run risk-based end-to-end verification and produce a compact evidence report.
---

# Full QA

1. Determine the changed/user-critical surfaces before selecting checks.
2. Read Project Memory commands and `quality-gates`.
3. Run deterministic checks appropriate to risk: lint/type/build/unit/integration/E2E/browser as available.
4. For meaningful UI changes, load `frontend-verification`; add accessibility/visual regression guidance when relevant. Do not load design skills merely to verify.
5. If the changed surface can materially affect user-perceived performance, verify the documented `performance-budget`.
6. If analytics/events/flags changed, verify the `analytics-contract` including privacy-safe payloads and failure isolation.
7. For auth, permissions, secrets, payments, tenant/data boundaries or privileged external writes, add Security Boundary Review and negative-path checks.
8. Inspect failures by evidence; do not paper over them or weaken tests.
9. Report exact checks/results, what was not runnable and remaining risk; use the verification evidence template when the change benefits from a durable packet.

Do not rerun unchanged expensive suites without a reason. Reuse trustworthy check results from the current commit when available.
