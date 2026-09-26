---
name: performance-budget
description: Define and enforce measurable performance budgets and regression checks for user-critical web, API and application paths.
---

# Performance Budget

Use when work can materially affect page load, interaction latency, rendering, bundle/assets, network usage, API latency, memory/CPU or other user-perceived performance.

This skill owns **measurable performance expectations**. Observability tools report production behavior; quality gates decide when the checks are required.

## Establish the budget

Do not invent one universal threshold for every project. Record project-specific budgets in Project Memory, requirements or the relevant performance config.

Examples:
- web: Core Web Vitals, Lighthouse categories, JS/CSS/image transfer size, route load time,
- API/backend: p50/p95/p99 latency, error rate, resource use,
- mobile/desktop app: startup time, frame responsiveness, memory/CPU where measurable.

Prefer a small set of metrics tied to real user journeys.

## Baseline and method

Before enforcing a new budget:
1. identify the user-critical path,
2. record a stable baseline in a repeatable environment,
3. choose the metric/tool and variance tolerance,
4. define what counts as regression,
5. document any environment limitations.

For web projects, Lighthouse CI and browser performance traces are useful options when they fit the stack.

## Change verification

When performance is materially affected:
- compare against the documented baseline/budget,
- inspect large asset/bundle/network changes,
- verify caching/lazy loading only when behavior requires it,
- avoid micro-optimizations without measured benefit,
- report meaningful regressions even if functional tests pass.

Do not hide a regression by relaxing the threshold without a documented product/engineering decision.

## CI and release

Fast budget checks can run on relevant PRs. More variable or expensive matrices can run at release/staging level.

A release with a known budget regression must carry explicit evidence, impact and an accepted exception/rollback plan; passing unrelated tests does not erase the regression.
