# Documentation Map

Use this map only when you need to locate a policy or template. Do not preload the documentation set.

## Always / startup context

These are the only shared documents normally loaded at session start:

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical cross-agent working agreement |
| `docs/PROJECT-MEMORY.md` | Compact durable project facts |
| `docs/CURRENT-HANDOFF.md` | Current unfinished-task recovery state |

Load `docs/REQUIREMENTS.md` additionally when the task concerns product/backlog/bug requirements.

## Task and execution

| File | Read when |
| --- | --- |
| `docs/REQUIREMENTS.md` | Selecting or implementing product work |
| `docs/TASK-LIFECYCLE.md` | Recovering/handing off task → branch → PR state |
| `docs/AGENT-ORCHESTRATION.md` | Planning multi-role or independent-review work |
| `docs/EXECUTION-ROUTING-POLICY.md` | Choosing agent host/model/parallelism |
| `docs/LOCAL-AGENT-ROUTER.md` | Delegating scoped work to local Claude Code or Gemini CLI |
| `docs/AGENT-PLATFORM-WORKFLOWS.md` | Host portability/onboarding |
| `docs/MEMORY-CONTEXT-POLICY.md` | Context/token problems or memory design |
| `docs/CODE-HEALTH-AND-CONTEXT.md` | Cleanup/dead-code/context-efficiency work |

## Quality, design and operations

| File | Read when |
| --- | --- |
| `docs/DESIGN-STACK.md` | Substantial frontend design/UX direction |
| `REVIEW.md` | Reviewing a material PR/change |
| `docs/OPERATIONS-RECOVERY.md` | Production runtime, deploy verification, rollback, backup/restore or incident work |
| `docs/DOCUMENTATION_POLICY.md` | Resolving documentation authority/drift or deciding where knowledge belongs |
| `docs/STACK-RESPONSIBILITY-MAP.md` | Checking whether a proposed tool/skill/doc duplicates an existing responsibility |

## Integrations and lifecycle

| File | Read when |
| --- | --- |
| `docs/MCP-SETUP.md` | Using/adding an external connector/MCP |
| `docs/PROJECT-BOOTSTRAP-CHECKLIST.md` | Creating a real project from the starter |
| `docs/BRANCH-LIFECYCLE.md` | Branch protection/cleanup |
| `docs/VERSIONING.md` | Version/release identity |
| `docs/CLAUDE-GEMINI-SETUP.md` | Claude Code/Gemini host setup |
| `docs/CLI-AGENT-STACK.md` | Optional local coding-host setup |

## Durable decisions

- `docs/adr/0001-agent-independent-engineering.md` — accepted baseline architecture decision.
- New durable architecture decisions use `docs/templates/ADR-TEMPLATE.md`.

## Templates

Templates are reference material; load only the one needed:

- `docs/templates/IMPLEMENTATION-PLAN-TEMPLATE.md`
- `docs/templates/VERIFICATION-EVIDENCE-TEMPLATE.md`
- `docs/templates/REVIEW-PACKET-TEMPLATE.md`
- `docs/templates/RELEASE-SUMMARY-TEMPLATE.md`
- `docs/templates/OPERATIONS-RUNBOOK-TEMPLATE.md`
- `docs/templates/ANALYTICS-EVENT-CONTRACT-TEMPLATE.md`
- `docs/templates/FRONTEND-VISUAL-QA-TEMPLATE.md`
- `docs/templates/PLAYWRIGHT-VISUAL-SANITY.md`
- `docs/templates/MCP-PROFILE-EXAMPLE.md`
- `docs/templates/ROUTING-PROFILE-EXAMPLE.md`
- `docs/templates/PROJECT-SKILL-TEMPLATE.md`

Agent-skill discovery is separate: use `.agents/SKILL-INDEX.md`.

## Maintenance

Run `node scripts/validate-docs.mjs` to check documentation structure/references. After adapting the starter into a real project, run `node scripts/validate-docs.mjs --strict-project` to find starter placeholders that should have been replaced.
