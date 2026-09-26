---
name: finish-feature
description: Take a feature or fix from requirement through a verified PR into dev.
---

# Finish Feature

1. Classify scope/risk and retrieve only the relevant project context.
2. For non-trivial/cross-cutting/high-risk work, load `implementation-planning` and create/update a compact task plan before editing.
3. Start from current `dev` on a focused feature/fix/chore branch unless already on the correct active branch; for non-trivial work create/reconcile the draft PR early so task → branch → PR continuity exists before a long implementation pass.
4. Trace the active code/data path before editing.
5. Implement the smallest complete change.
6. Load only the specialist skills triggered by the work.
7. Run targeted deterministic checks while implementing.
8. For material frontend work, run `frontend-verification`; for performance- or analytics-relevant changes, load the corresponding specialist skill.
9. Inspect the diff against the selected requirement and plan where one exists; update tests/docs where behavior or durable contracts changed.
10. Once the branch is otherwise ready to become the final merge candidate, reset the task-state block in `docs/CURRENT-HANDOFF.md` to idle **before the final required gate**; keep durable task evidence in the PR.
11. Run the required final gate on that exact head SHA. Any later commit makes earlier green checks stale and requires re-verification. If more implementation is needed, restore an active task state before continuing.
12. Open/update the PR into `dev`; merge only when the current head is verified. Never route ordinary work directly to `prod`.

Always use `quality-gates` for material changes. Use `test-engineering` when the harness/fixtures/regression architecture needs work. Add `security-boundary-review` only for sensitive boundaries, and load frontend/performance/analytics specialist skills only when their surfaces are affected.
