# Agent Orchestration

Use capability roles so the workflow remains agent-independent.

## Roles

### Planner / Architect
Use for ambiguous, cross-system or high-risk work. Use `implementation-planning` when a durable plan is justified. It produces a compact evidence-based implementation sequence, affected boundaries, risks, rollback and verification strategy without duplicating product requirements.

### Executor / Implementer
Makes the smallest complete change on an isolated branch/worktree and follows project-specific skills.

### Independent Reviewer
Uses the original requirement, final diff, relevant source and deterministic check results. It does **not** need the implementer's full transcript.

### Security Reviewer
Used when auth, permissions, secrets, payments, personal data, tenant isolation, privileged functions or external write boundaries change.

### Multimodal / Long-context Specialist
Used when screenshots, PDFs, large document sets or repository-scale context materially matter.

### Fast Utility Worker
Used only for low-risk mechanical tasks where the capability is clearly sufficient.

## Default flow

```text
request
  ↓
classify outcome + capability + risk
  ↓
reconcile existing task/branch/PR when applicable
  ↓
create/resume isolated branch + early draft PR for non-trivial work
  ↓
select one primary Superpower or direct skill
  ↓
assign agent/host + model class + justified parallelism
  ↓
retrieve minimal relevant project context
  ↓
plan with implementation-planning if complexity/risk justifies it
  ↓
implement
  ↓
deterministic tests/build/lint/browser checks on final candidate SHA
  ↓
independent review when required
  ↓
repair confirmed findings + reverify if the SHA changes
  ↓
merge PR into dev
  ↓
human release approval when releasing
  ↓
for release tasks: deployed-revision + health/smoke verification
  ↓
rollback/contain if release verification fails
```

## Independent review contract

For sensitive/high-impact work, prefer a reviewer that is independent of the implementation pass. When possible use a different capable provider or at least a fresh session that receives the requirement and evidence rather than the implementer's reasoning transcript.

Use `docs/templates/REVIEW-PACKET-TEMPLATE.md` for a compact review handoff.

A valid independent review should:
- inspect the requirement and final diff,
- verify concrete evidence,
- identify real failure modes rather than stylistic preferences,
- classify material findings by severity,
- avoid manufacturing findings when none exist.

## Review rules

Require independent review when practical for:
- security/auth/authorization,
- payments,
- schema/data migrations,
- privacy-sensitive flows,
- architecture changes,
- release/deployment boundaries,
- critical high-impact code.

Automated deterministic checks are stronger evidence than a model reviewing its own work.

## Superpower orchestration

Superpowers live under `.agents/superpowers/` and sequence existing skills around an outcome. They must stay compact, reference specialist skills instead of copying them, and avoid loading unrelated guidance.

Use `.agents/skills/task-routing/SKILL.md` when the request is broad, stalled or naturally end-to-end. If the environment exposes multiple agents/hosts or model choices, use `.agents/skills/execution-routing/SKILL.md` after task routing.

## Context efficiency

Pass reviewers:
- original requirement,
- current diff,
- changed/relevant files,
- project rules,
- test/build evidence.

Do not pass a long implementation transcript unless it contains unique required evidence.

See `docs/MEMORY-CONTEXT-POLICY.md`.
