# New Project Bootstrap Checklist

Use this immediately after creating a repository from Agent Project Starter.

## Identity and source

- [ ] Rename/update README for the real project.
- [ ] Fill `docs/PROJECT-MEMORY.md` and confirm `.agents/project-policy.json` matches the repository branch policy.
- [ ] Replace the examples in `docs/REQUIREMENTS.md` with the project's ordered requirements, issues and roadmap.
- [ ] Replace `.agents/skills/project-template/` with a real `.agents/skills/<project-name>/SKILL.md`; remove its obsolete generated `.claude/skills/project-template/` adapter and regenerate Claude adapters.
- [ ] Remove starter-only examples/placeholders that do not apply.

## Branching

- [ ] Ensure `prod` exists as production/release branch and is the default branch.
- [ ] Create `dev`.
- [ ] Configure ordinary work as feature/fix/chore → dev.
- [ ] Configure production flow as dev → prod only.
- [ ] Create/require `production-approved` label if using the provided release guard.
- [ ] Protect `dev` and `prod` from deletion/force-push and require PRs as appropriate.
- [ ] After the checks have run at least once, require `policy / agent-stack`, `policy / version`, `security / gitleaks`, `security / semgrep`, and `security / dependency-audit` on `dev` (or the adapted project equivalents).
- [ ] On `prod`, also require `policy / prod-source-and-approval` so only an approved same-repository `dev` PR can release.
- [ ] Configure a real human production approval mechanism (for example required approving review/CODEOWNER/protected deployment as appropriate); the `production-approved` label check is supplemental and cannot by itself prove the approver was human.
- [ ] Enable GitHub native **Automatically delete head branches** after `dev` is protected.

## Build and tests

- [ ] Record install/dev/test/build/lint/typecheck commands in Project Memory.
- [ ] Add project-specific CI.
- [ ] Use `test-engineering` when selecting/repairing the harness; prefer an existing runner before adding another framework.
- [ ] Add unit/integration tests for critical logic and negative paths.
- [ ] Add Playwright/browser checks if the project has important UI workflows.
- [ ] Ensure material verification can report exact commands/results/artifacts rather than only “tests passed”.
- [ ] Verify generic security workflow is compatible with the stack.
- [ ] If the project has `package.json`, commit an npm lockfile or adapt `security / dependency-audit` to its actual package manager before requiring the check.
- [ ] Configure dependency update automation for the actual package ecosystems used by the project.
- [ ] Keep dependency update PRs reviewable; do not enable blanket auto-merge by default.

## Frontend quality

For projects with a frontend:

- [ ] Record the design system/component library and brand assets.
- [ ] Record semantic text/surface/border/accent tokens and theme variants; prefer token pairs over ad-hoc foreground/background colors.
- [ ] Record default visual variance, motion level and information density.
- [ ] Read `docs/DESIGN-STACK.md` and enable only the design sources the project needs.
- [ ] For frontend projects, install/review UI/UX Pro Max when structured design intelligence is useful; use Taste Skill for creative direction and Impeccable for critique/polish.
- [ ] Add Motion only when the actual project needs material runtime animation beyond CSS; for new React work use the current `motion` package, not legacy `framer-motion`.
- [ ] Review third-party installers/hooks/scripts before enabling them and keep machine-local caches/configuration out of Git.
- [ ] Document critical mobile/desktop breakpoints and accessibility constraints.
- [ ] Define the real-browser verification matrix for material UI changes: primary flow, desktop/mobile, console, relevant network failures and changed loading/error/empty states.
- [ ] Add a focused visual-sanity check for contrast, alignment, spacing, overflow, clipping, overlap and theme/state variants; use the visual-QA template where useful.
- [ ] Add screenshot/browser verification for important visual changes.
- [ ] Add accessibility automation/manual keyboard checks for critical UI flows.
- [ ] Use stable screenshot baselines for critical states instead of snapshotting every page.

For non-frontend projects, mark this section Not applicable rather than inventing UI requirements.

## Performance and analytics

- [ ] If user-perceived performance is important, record a stable baseline and measurable project-specific budget; add CI/release enforcement where repeatable.
- [ ] For web projects, consider Lighthouse CI/browser traces only when they fit the stack; do not copy universal thresholds blindly.
- [ ] If product analytics is enabled, define a provider-neutral event contract/taxonomy before wiring events.
- [ ] Document forbidden/sensitive analytics properties and verify analytics failure cannot break transactional product behavior.
- [ ] Mark performance and analytics explicitly Not used when the project does not need them.

## MCP/connectors

- [ ] Complete the Project MCP profile in `docs/MCP-SETUP.md`.
- [ ] Mark each capability Required / Optional / Not used.
- [ ] Connect only needed providers in each agent host.
- [ ] Verify each connection with a harmless read.
- [ ] Document non-secret account/project/environment identifiers.
- [ ] Confirm secrets are stored outside Git.
- [ ] Record destructive/sensitive operations that require review.

## Code health and context efficiency

- [ ] For JS/TS projects, decide whether Knip or another dead-code analyzer is useful.
- [ ] Run dead-code analysis in report-only mode before enabling automatic fixes.
- [ ] Pair static cleanup findings with Graphify/source/runtime verification.
- [ ] Keep Headroom optional until baseline measurements show a real context bottleneck.
- [ ] If piloting Headroom, record before/after quality and usage metrics.

## Task / branch continuity

- [ ] Use one task → one writable branch → one draft/open PR for non-trivial work.
- [ ] Keep the AGENT_TASK_STATE block in `docs/CURRENT-HANDOFF.md` valid.
- [ ] Run `node scripts/task-state.mjs --check` during bootstrap/validation.
- [ ] Run `node scripts/validate-docs.mjs --strict-project` after replacing starter placeholders.
- [ ] Treat open branches as candidates only; reconcile task/PR/GitHub state before resuming.
- [ ] Use separate branches/worktrees for parallel modifying agents.

## Memory/context

- [ ] Keep Project Memory compact.
- [ ] Keep Current Handoff current during unfinished work.
- [ ] Configure Graphify for larger/cross-file repositories if useful.
- [ ] Add generated/dependency/secret paths to `.graphifyignore`.
- [ ] Do not use chat history as the only project memory.
- [ ] Keep root `AGENTS.md` inside the canonical context budget; move catalog/reference detail to on-demand files instead of growing startup context.
- [ ] Use `scripts/context-packet.mjs` to measure broad task packets when repeated context loading becomes expensive.

## Security

- [ ] Document authorization boundary.
- [ ] Document tenant/user isolation if applicable.
- [ ] Document secret storage.
- [ ] Document sensitive logging/data rules.
- [ ] Document data classification/minimization plus retention/deletion/export expectations where personal/sensitive data exists.
- [ ] Document public API/webhook/upload trust boundaries, signature/replay/rate-limit/idempotency expectations where applicable.
- [ ] Add project-specific security checks for auth/payments/storage/data.

## Requirements / work tracking

- [ ] Use stable requirement/issue IDs for material planned work.
- [ ] Put acceptance criteria on non-trivial requirements before implementation.
- [ ] For cross-cutting/high-risk work, use `implementation-planning` and the implementation-plan template to record delivery order, rollback and verification without duplicating requirements.
- [ ] Mark checklist items complete only after verification and record concise evidence.
- [ ] Keep completed/cancelled items for history or follow the project's explicit archival policy.

## Review and release evidence

- [ ] Decide which changes require independent review.
- [ ] Use `docs/templates/REVIEW-PACKET-TEMPLATE.md` for sensitive/high-impact review handoffs.
- [ ] Use `docs/templates/VERIFICATION-EVIDENCE-TEMPLATE.md` when material work benefits from a compact reproducible check/browser/performance/analytics evidence packet.
- [ ] Use `docs/templates/RELEASE-SUMMARY-TEMPLATE.md` for dev→prod releases.

## Deployment/operations

- [ ] Document actual local/preview/staging/production runtime identities; branch names alone do not prove database/auth/external-service isolation.
- [ ] Record how the deployed revision/build is verified for production.
- [ ] Connect hosting MCP only if needed.
- [ ] Add observability/analytics only if useful and privacy-safe.
- [ ] For production runtime/data, adapt `docs/templates/OPERATIONS-RUNBOOK-TEMPLATE.md` or maintain equivalent runbook information: health/smoke, observability, rollback, backup/restore and incident minimums.
- [ ] For schema/data changes, document deploy order, old/new compatibility and recovery/rollback constraints.
- [ ] If localization is used, record source/supported locales, fallback, date/time/number/currency/timezone policy and RTL requirements where applicable.

## Optional local coding hosts

- [ ] If local coding CLIs are useful, read `docs/CLI-AGENT-STACK.md` and enable only the hosts actually used by the project/team.
- [ ] Run `node scripts/agent-cli-doctor.mjs` only on workstations where those local hosts are used.
- [ ] Use separate branches/worktrees for parallel modifying agents.
- [ ] For Claude Code, install third-party plugins only when their concrete value and trust/privacy boundary have been reviewed; no third-party plugin is auto-enabled by the starter.
- [ ] Keep `REVIEW.md` aligned with project-specific review invariants.
- [ ] Do not add another coding-agent host unless a concrete uncovered capability gap is documented.

## Agent portability

- [ ] Verify Codex/ChatGPT workflow.
- [ ] Verify Claude bootstrap.
- [ ] Verify Gemini bootstrap.
- [ ] Verify OpenCode when used by the team; add Cursor/Cline/Roo/Windsurf only when a project-specific workflow requires them.
- [ ] Ensure every host resolves back to `AGENTS.md`.

## Final bootstrap verification

A fresh agent should be able to answer, without asking the project owner:
- What is this project?
- Which branch should I work from?
- How do I test/build it?
- Which files are important?
- Which MCP capabilities exist?
- Which external writes are sensitive?
- How do I release safely?
- Where do I record unfinished work?
- If there is a frontend, which design source is authoritative and what rendered-runtime verification is required?
- If performance budgets or analytics are used, where are their contracts and how are they verified?
- Which runtime/environment is safe for this task, and how is its data/auth target identified?
- If localization is used, what are the locale/fallback/timezone/formatting rules?
- For production, how is the deployed revision verified, which smoke/health signals matter, and what is the rollback/recovery path?

If not, the bootstrap is incomplete.

## Version and branch setup

- [ ] Read VERSIONING and BRANCH-LIFECYCLE; preserve an existing app version.
- [ ] Protect prod/dev and require production guard plus version validation.
- [ ] Verify a merged test branch is cleaned up.
- [ ] Follow `docs/CLAUDE-GEMINI-SETUP.md` for the chosen host; verify context, skills and actual MCP connections.
- [ ] Regenerate Claude adapters after adding a project skill: `node scripts/sync-claude-skills.mjs --write`.
