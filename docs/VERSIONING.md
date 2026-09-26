# Versioning and release identity

All agents must read this policy when changing behavior, compatibility or preparing a release.

## Source of truth

`VERSION` contains the planned stable release as MAJOR.MINOR.PATCH. The initial baseline is `0.1.0`; this does not claim a published release. `CHANGELOG.md` records user-visible changes under Unreleased until release preparation. The starter's compatibility contract includes documented commands, configuration, generated project layout and required agent workflow.

- PATCH: compatible fixes, documentation and maintenance.
- MINOR: compatible capabilities; during 0.x, also explicitly documented breaking changes.
- MAJOR: incompatible changes once 1.0 is declared stable.
- Do not bump once per agent message or commit. Prepare one version for the reviewed release scope.
- Use conventional PR titles (`fix:`, `feat:`, `chore:`, and `!` for breaking changes) and state release impact in the PR.
- Apps copied from the starter own their version independently. Record the upstream starter commit/version separately; never overwrite an existing app version with the starter's version.

SemVer reference: https://semver.org/

## Agent development checklist

1. Read VERSION, changelog, current release tags and this policy.
2. Add meaningful user-facing notes to Unreleased; identify breaking changes and migration actions.
3. Keep ecosystem manifest/lockfile versions synchronized if introduced. This stack-neutral starter has no package manifest.
4. Run `node scripts/validate-docs.mjs`, `node scripts/validate-version.mjs` and `node --test tests/*.test.mjs`.
5. Include version impact and any compatibility risk in the PR/handoff.

## Release preparation and publication

1. Prepare a feature/chore PR into dev: choose a version greater than prod's VERSION (first adoption may keep 0.1.0), move applicable Unreleased entries to `## [X.Y.Z] - YYYY-MM-DD`, retain the Unreleased heading, and document tests/rollback.
2. Open dev → prod. Version validation requires an increased version and matching dated notes. Follow the production approval and release-readiness rules. A version bump does not authorize production.
3. After the approved merge, create an immutable annotated `vX.Y.Z` tag on the exact verified prod merge commit and a GitHub Release containing that version's changelog notes. Use a verified GitHub tool or `git tag -a vX.Y.Z <prod-merge-sha>` then `git push origin vX.Y.Z`; never tag dev as stable, move a published tag or reuse a version.
4. Verify the remote tag/release target. Record version, SHA, release URL and checks in Current Handoff. Sync released prod ancestry back to dev through the normal reviewed workflow when needed.

Publication is deliberately human-approved; CI validates versions but does not create releases or deploy. Development artifacts can use `X.Y.Z-dev.<run>+<shortsha>` as build metadata without changing VERSION. Do not present a development build as released.

## CI enforcement

`Version validation / version` validates stable syntax, changelog presence, non-decreasing PR versions, and release increase/dated notes on PRs into prod. Configure it as a required check. Branch rules must also enforce the existing production guard; a workflow alone cannot prevent a bypassing merge or direct push.
