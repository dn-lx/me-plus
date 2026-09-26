---
name: implementation-planning
description: Turn a non-trivial requirement into a compact evidence-based implementation plan without duplicating product requirements.
---

# Implementation Planning

Use for ambiguous, cross-cutting, multi-step, migration-heavy, externally integrated or high-risk work where implementation order and verification need to be explicit.

This skill owns **how the work will be delivered**. `docs/REQUIREMENTS.md` owns **what the product must do**.

## When a durable plan is required

Create or update a task plan when one or more apply:
- multiple architectural boundaries or repositories are affected,
- data/schema/auth/payment/external-write behavior changes,
- a migration or compatibility strategy is needed,
- sequencing mistakes could create user-visible or operational risk,
- several agents or handoffs may participate,
- the user explicitly asks for a plan.

Do not create a plan file for a tiny, obvious, low-risk change.

## Evidence before planning

Before proposing implementation:
1. read the requirement/acceptance criteria,
2. trace the current code/data path,
3. inspect relevant tests and active configuration,
4. identify external systems and trust boundaries,
5. separate verified facts from assumptions.

## Plan contents

Use `docs/templates/IMPLEMENTATION-PLAN-TEMPLATE.md` for durable plans. When the plan must survive handoffs, store it under `docs/plans/<task-id>-<slug>.md` (create the folder only when needed); otherwise the PR description can carry the compact plan. Keep it compact.

A valid plan states:
- intended outcome and non-goals,
- verified current-state evidence,
- affected components/contracts,
- ordered implementation steps,
- migration/compatibility/deploy-order/rollback needs, including old/new application/data compatibility where relevant,
- testing and browser/runtime evidence,
- security/privacy implications,
- performance and analytics implications when relevant,
- unresolved decisions or assumptions.

Prefer paths, symbols, interfaces and acceptance criteria over long prose.

## Execution discipline

- A plan is not authorization to change production or perform external writes.
- Update the plan when scope or assumptions materially change.
- Do not mark steps complete until evidence exists.
- If discovery invalidates the plan, revise it before continuing rather than forcing the original sequence.
- Link durable architecture decisions to an ADR instead of burying them in a task plan.

Task-specific implementation details belong in the PR/plan; stable project facts belong in Project Memory.
