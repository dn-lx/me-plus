---
name: code-hygiene
description: Find and remove confirmed dead code, unused exports/dependencies and obsolete paths without breaking dynamic/runtime behavior.
---

# Code Hygiene

Use for repository cleanup, dead-code investigation, dependency pruning, large refactors, or when a project has accumulated obsolete files and exports.

This skill is **review-first**. A static analyzer finding is evidence to investigate, not permission to delete blindly.

## Goals

Reduce:
- unused files,
- unused exports/types,
- unused dependencies/devDependencies,
- stale feature code,
- unreachable branches,
- duplicated superseded implementations,
- abandoned configuration/assets.

Do not trade correctness for a cleaner report.

## JavaScript / TypeScript projects

Prefer **Knip** when the project is compatible.

Typical investigation:

~~~bash
npx knip
~~~

For production-only reachability when appropriate:

~~~bash
npx knip --production
~~~

Only after reviewing findings and configuring real entry points may automated fixes be considered.

Knip can fix selected unused exports/dependencies and, with explicit file-removal permission, unused files. Always use Git so every deletion is reviewable.

Do **not** add Knip permanently to non-JS/TS projects.

## Safe cleanup sequence

~~~text
static dead-code report
        ↓
inspect project entry points/config
        ↓
Graphify/source search
        ↓
check dynamic imports/routes/plugins/config references
        ↓
inspect Git history if intent is unclear
        ↓
remove smallest confirmed-dead set
        ↓
tests + build + type/lint
        ↓
browser/runtime verification where applicable
        ↓
review final diff
~~~

## False-positive / reachability hazards

Be especially careful with:
- dynamic imports/requires,
- route/file-system conventions,
- framework auto-discovery,
- plugin registries,
- dependency injection/reflection,
- CLI entry points,
- migration files,
- scheduled/serverless functions,
- test fixtures,
- build scripts,
- HTML/CSS referenced assets,
- string-based function/module names,
- external webhooks/cron jobs.

If the analyzer cannot see a runtime entry point, configure the analyzer rather than suppressing broad categories or deleting working code.

## Graphify pairing

Use Graphify to inspect import/caller/change relationships before removal, but remember static code graphs can miss the same dynamic/runtime edges.

A stronger conclusion comes from several aligned signals:

~~~text
Knip/static analyzer
+ Graphify/source search
+ no runtime/config references
+ passing tests/build
+ final diff review
~~~

## Automated fixes

Rules:
- run report-only first,
- never combine a huge auto-delete with unrelated refactoring,
- remove in small batches,
- inspect every changed/deleted file,
- rerun the analyzer after each meaningful batch,
- rerun project verification,
- revert uncertain deletions.

Do not use an auto-fix flag as a CI mutation step.

## Dependencies

Before removing an "unused" package, check whether it is consumed by config files, scripts, loaders/plugins, build tools or runtime environment conventions.

## CI policy

Dead-code analysis may be advisory scheduled, a maintenance/release check, or blocking only after the project has a mature low-noise configuration.

Do not introduce a noisy mandatory gate on day one.

## Other languages

Use the stack's established static-analysis/dead-code tools instead of forcing Knip. Preserve the same review-first sequence.

## Documentation

If cleanup removes a feature, integration, route, command, environment variable or architectural path, update maintained docs/project memory as appropriate.