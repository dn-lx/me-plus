# Agent Stack Responsibility Map

Use this map before adding a new skill, MCP, CI job or agent tool. The goal is coverage without duplication.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Project Bootstrap | Adapting the starter to a real repository | Day-to-day implementation |
| Project Memory | Durable current project facts | Temporary task state or full chat history |
| Current Handoff | Recent/unfinished task state | Long-term architecture |
| MCP Usage | Safe external capability discovery/verification | Vendor-specific application logic |
| Context7 | Current third-party SDK/API documentation | Repository architecture |
| Graphify | Static code relationships/change-impact navigation | Runtime truth, dead-code deletion, external services |
| Code Hygiene | Confirmed dead code/unused exports/dependencies | Dependency upgrades or context compression |
| Dependency Maintenance | Upgrades, advisories, lockfiles/update bots | Removing unused code |
| Task Routing | Select one primary outcome workflow and minimal skill set | Choosing provider/model execution details |
| Task Continuity | Bind/recover task → repository → branch → PR state across interruptions | Choosing implementation strategy or treating every open branch as active |
| Execution Routing | Assign agent/host, model class and justified parallelism | Task decomposition logic inside a Superpower |
| Optional CLI Stack | Claude Code, Codex CLI, Gemini CLI and OpenCode host setup/isolation when a project uses them | Core repository policy |
| Optional Claude Plugins | Ponytail/Superpowers/Code Review plus optional claude-mem/Obsidian integration | Core repository policy or automatic activation |
| REVIEW.md | Shared correctness/security/regression review contract | Replacing CI, tests or production approval |
| Superpowers | End-to-end sequencing around resume/deliver/repair/verify/release/audit outcomes | Duplicating specialist skill instructions |
| Memory Context | Retrieval/context discipline, task-packet sizing and durable memory rules | Compression proxy implementation or omitting evidence just to save tokens |
| Implementation Planning | Task-specific implementation sequence, affected boundaries, rollback and verification plan | Product requirements/backlog intent or durable architecture decisions |
| Test Engineering | Test harness architecture, fixtures and regression coverage | Selecting risk-tier checks for each change |
| Frontend Verification | Rendered browser/runtime workflow plus visual sanity for contrast, alignment, spacing, overflow, clipping, overlap, responsive/theme states, console/network and failure-state evidence | Choosing visual direction or replacing accessibility/visual-regression checks |
| Performance Budget | Measurable user-critical performance budgets and regression evidence | Production observability or speculative micro-optimization |
| Analytics Contract | Provider-neutral event taxonomy, privacy-safe properties and wiring verification | Transactional product logic or provider account configuration |
| Headroom Pilot | Optional measured context compression | Project memory or dead-code cleanup |
| Design Stack | Taste Skill for creative direction, UI/UX Pro Max for structured design intelligence, Impeccable for critique/polish | Runtime animation implementation or accessibility evidence |
| Motion Runtime | Production animation/gesture/layout-transition implementation when CSS is insufficient | Choosing visual direction or replacing UX/a11y review |
| Accessibility + Visual Regression | UI verification evidence and regression detection | Choosing the visual direction |
| Quality Gates | Which deterministic checks are required by risk | Implementing the feature |
| Security Boundary Review | Auth/secrets/data/external trust-boundary reasoning | Generic linting or dependency updates |
| Agent Orchestration | Planner/implementer/reviewer role flow | Vendor lock-in |
| Release Workflow | Allowed branch/release path | Deciding technical release readiness |
| Release Readiness | Evidence/risk check before production | Authorization to merge |
| Operations / Recovery | Runtime identity, deployed-revision proof, health/smoke, observability, rollback, backup/restore and incident minimums | Replacing release authorization or application-specific SRE design |

## Intentional overlaps

### Task Routing + Task Continuity + Execution Routing + Superpowers + Skills

- Task Routing selects one outcome workflow.
- Task Continuity determines whether valid work already exists and which task/branch/PR binding may be resumed.
- Execution Routing decides where it runs, which model class is used and whether extra agents are justified.
- A Superpower sequences the work.
- Skills supply specialist procedures only when triggered.

Do not preload all three layers in full; progressive loading is the point.


Some overlap is useful and deliberate:

### Design Stack + Accessibility/Visual

- Design Stack chooses the smallest design-intelligence path for direction, structured UX guidance and critique.
- Motion Runtime implements animation only when the product actually needs it.
- Accessibility/Visual Regression remains independent verification evidence.

Do not load every design layer automatically; use only what the task needs.

### Test Engineering + Quality Gates

- Test Engineering builds/repairs the harness and regression strategy.
- Quality Gates selects which deterministic checks are required by change risk.

Do not add a second test framework when the existing harness can prove the behavior.

### Frontend Verification + Accessibility/Visual + Performance

- Frontend Verification proves the real rendered workflow and runtime health.
- Accessibility/Visual Regression supplies specialist a11y and stable screenshot evidence.
- Performance Budget measures user-perceived regressions when performance is affected.

These layers may run together, but none replaces the others.

### Quality Gates + Security Review + Release Readiness

- Quality Gates selects checks during development.
- Security Review deeply inspects sensitive trust boundaries.
- Release Readiness evaluates the full release candidate.

They should reference each other rather than duplicate full procedures.

### Graphify + Code Hygiene

- Graphify says how code is connected.
- Code Hygiene determines whether suspected unused code can be safely removed.

Neither is sufficient by itself for deletion.

### Memory Context + Headroom

- Memory Context is the default strategy.
- Headroom is an optional implementation optimization only when measurements justify it.

## Before adding another tool/skill

Ask:

1. What concrete failure/problem is not covered today?
2. Which existing layer is closest?
3. Can the existing layer be extended instead of adding another skill?
4. Will the new tool reduce work/error/context more than it adds configuration and maintenance?
5. Can it remain optional if only some projects need it?
6. Does it create a new secret/data boundary?
7. How will we measure whether it helps?

If the answer is mostly “another way to do what we already do,” do not add it. The optional CLI profile already documents Claude Code + Codex CLI + Gemini CLI + OpenCode; add or enable hosts only for a concrete project-specific gap.
