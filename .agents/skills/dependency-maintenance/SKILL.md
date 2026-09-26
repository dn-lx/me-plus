---
name: dependency-maintenance
description: Keep application, tooling and CI dependencies current with reviewable automated updates and risk-based verification.
---

# Dependency Maintenance

Use for dependency upgrades, security advisories, lockfile maintenance, package-manager changes, or automated update configuration.

## Principles

- Prefer small, reviewable updates over large surprise upgrade batches.
- Keep lockfiles committed when the project ecosystem expects them.
- Never auto-merge a dependency update merely because CI is green.
- Treat major-version upgrades and security-sensitive packages as implementation work, not routine housekeeping.
- Verify current migration/release notes for breaking changes before upgrading important frameworks, SDKs, auth, database, payment, build or deployment tooling.

## Automated update bots

Dependabot, Renovate or an equivalent updater may create PRs.

The starter enables **GitHub Actions** update PRs because every generated repository inherits GitHub workflows. Add project package ecosystems only after the real stack is known.

Typical ecosystems that may be added during bootstrap:
- npm / pnpm / yarn,
- pip / poetry,
- cargo,
- bundler,
- docker,
- maven / gradle,
- gomod.

Do not configure an ecosystem that the project does not actually use.

## Upgrade workflow

1. Read the package/framework changelog or current migration docs for material upgrades.
2. Inspect the update diff and lockfile changes.
3. Run project-specific type/lint/unit/integration/build checks.
4. Run affected browser/mobile/runtime checks.
5. For auth, database, payments, hosting, build tooling or other sensitive dependencies, apply Security Boundary Review where relevant.
6. Review transitive dependency changes if risk is high.
7. Merge into `dev` only after evidence is green.
8. Release to `prod` through the normal release workflow.

## Update grouping

Grouping is useful for tightly related low-risk packages, but avoid grouping unrelated major upgrades into one PR.

Examples of reasonable groups:
- testing utilities,
- lint/format tooling,
- closely coupled framework packages,
- GitHub Actions.

Keep framework/runtime majors separate unless the migration explicitly requires a coordinated upgrade.

## Security advisories

For a real exploitable/security advisory:
- identify whether the vulnerable path is actually reachable,
- upgrade or mitigate promptly,
- do not suppress the advisory just to get green CI,
- run targeted security and regression checks,
- document any temporary mitigation and removal date.

## Supply-chain hygiene

Review:
- newly introduced install scripts,
- unexpected package ownership/source changes,
- large dependency-tree expansion,
- packages with unclear maintenance status,
- dependency confusion/name similarity risks,
- lockfile/source-registry changes.

Do not paste registry tokens or private-package credentials into repository files or prompts.

## Removal

For suspected unused dependencies, use the Code Hygiene skill. Dependency Maintenance upgrades what is needed; Code Hygiene removes what is confirmed unnecessary.
