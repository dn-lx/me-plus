# Security advisory exceptions

This file records the only high-severity dependency advisories that Me+ currently allows the package audit to ignore. An exception is not a declaration that an advisory is harmless. It is a temporary, reviewable control for an upstream issue that has no patched package release and is not part of the deployed Me+ application runtime.

## Rules

- Every ignored GHSA must be listed in `pnpm-workspace.yaml` and in this file.
- The exception must identify the dependency path, why the affected code is outside the deployed application runtime, and the removal condition.
- Do not use a blanket `--ignore-unfixable` flag.
- A new advisory must fail CI until it is fixed or reviewed and explicitly added here.
- Remove an exception as soon as an upstream release removes or patches the affected dependency.

## GHSA-86w9-cpqp-85rv — node-forge

- Status: temporary upstream exception.
- Observed version: `node-forge@1.4.0`.
- Current path: Expo tooling, including `@expo/cli` and `@expo/code-signing-certificates`.
- Exposure assessment: Me+ does not use node-forge as an application-runtime signature-verification library; the dependency is reached through the Expo build/development toolchain.
- Upstream state at review: no patched version is available for this advisory.
- Review date: 2026-10-04.
- Removal condition: remove this exception when the Expo dependency graph no longer resolves an affected node-forge version or a patched node-forge release is available and compatible.

## GHSA-vfj7-8cjw-p6xm — braces

- Status: temporary upstream exception.
- Observed version: `braces@3.0.3`.
- Current path: Metro/micromatch tooling used by the React Native/Expo build pipeline.
- Exposure assessment: Me+ does not expose micromatch/braces pattern parsing as a network-facing application feature; this dependency is part of bundling/build tooling.
- Upstream state at review: no patched version is available for this advisory.
- Review date: 2026-10-04.
- Removal condition: remove this exception when the Metro/micromatch dependency graph no longer resolves an affected braces version or an upstream patch becomes available and compatible.
