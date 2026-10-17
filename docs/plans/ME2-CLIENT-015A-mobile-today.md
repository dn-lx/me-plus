# ME2-CLIENT-015A — Android Today first slice

## Outcome
Replace the mobile starter landing page with an authenticated daily flow: Today priorities, a conservative Now suggestion, recent guidance, and canonical Complete / Partial / Skip decisions with committed readback.

## Authority and authorization
- Owner request on 17 October 2026 explicitly authorizes building the app using Antigravity on their Windows computer and drive D:. This authorizes this task's isolated development checkout and CLI operations despite the older Android-build-only connector default; it does not alter that default for unrelated work.
- Canonical architecture Section 34 and roadmap G2 retain Expo/React Native, Supabase canonical state and shared deterministic logic.
- Base: dev cf90a19274c7eeecfe8e4e95d321415935485612. Pending PRs #77/#78/#38 remain independent; do not merge them or duplicate their backend/native work.
- Read-only Supabase routing retrieved the relevant architecture, roadmap and daily action specs. No matching mobile/architecture implementation checkpoint was returned.

## Scope
1. Trace existing mobile account/session and web Today/action-decision paths.
2. Share the platform-neutral Now ranking utility rather than importing server/web presentation code into mobile.
3. Add bounded owner-filtered action, unexpired recent guidance and calendar reads using the existing authenticated Supabase client and RLS.
4. Render Must / Should / Bonus, rationale, durations and honest as-of / loading / empty / stale / error states. Calendar failures must not imply free capacity or generate a confident Now recommendation.
5. Reuse the existing account sign-in/session behavior; reset sensitive in-memory state on account changes and ignore old in-flight responses.
6. Complete / Partial / Skip must call existing record_meplus_action_decision; no direct lifecycle writes. Acknowledge only after success and reload canonical state.
7. Preserve Health Connect and diagnostic routes and access from the new home.
8. Add meaningful deterministic tests for owner/query bounds, calendar failures, account/request races, mutation failure and ranking behavior. Preserve existing tests.
9. Record a small verification packet, changelog and active task handoff.

## Boundaries
No schema changes, live personal-data reads/writes for testing, credentials, bank/provider activation, scheduler changes, production deployment, merges, new paid services or broad dependency upgrades.
Current native persistence remains the existing adapter; this slice must not claim encrypted/secure storage or close the full session-hardening requirement.
Offline data stays labeled stale/read-only; do not queue writes or claim cross-device/device acceptance from synthetic tests.
No new analytics or animation library. Preserve existing dark theme, spacing/radius/typography tokens, accessible controls and touch targets.

## Verification and rollback
- Implementation complete:
  - Shared domain module `packages/domain/src/now-ranking.ts` implements `chooseNowAction`, `evaluateCalendarAvailability`, and `isRecommendationValid`, exported via `@me-plus/domain` and re-exported in `apps/web/lib/now-ranking.ts` preserving the existing ranking API.
  - Controller `apps/mobile/lib/today/today-controller.ts` with dependency injection handles bounded owner-filtered queries (user_id filter, limit 40 actions, limit 3 recommendations, limit 12 busy calendar events), calendar unavailable/invalid handling, atomic decision RPC calling `record_meplus_action_decision`, duplicate tap serialization, committed readback, and account switch/reset race protection.
  - Accessible, cohesive Today UI in `apps/mobile/app/index.tsx` using `@me-plus/ui` spacing/radius/typography tokens, dark palette, >=44px native touch targets, screen-reader labels, truthful refreshed timestamps, and preserved Health Connect and Sensor Diagnostics navigation.
  - Test suite `tests/mobile-today.test.mjs` covers bounded query filters, signed-out denial, calendar failure, calendar invalid rows, read error handling, account races, duplicate tap serialization, mutation failure safety, and committed readback.
- Scope bounds preserved:
  - No database migrations or schema alterations.
  - Existing Supabase session storage retained without claiming encryption; does not close the full session hardening or device-level acceptance requirement.
  - Synthetic data only used in tests; no live writes or network calls executed.
  - Full ME2-CLIENT-015 and physical Android acceptance remain separate follow-up milestones.
- Verification ready for coordinator:
  - Node integration suite (`tests/mobile-today.test.mjs` and existing tests).
  - Mobile TypeScript check (`pnpm --filter @me-plus/mobile typecheck`).
  - Web TypeScript check (`pnpm --filter @me-plus/web typecheck`).
- Roll back by reverting this development PR; no database or configuration migration is involved.


## Coordinator verification packet (17 October 2026)

The implementation is local and reviewable, not merge-ready. All 32 targeted tests pass (16 independently authored race/negative cases). Workspace typecheck and Expo web export passed; final exact-source reruns and full integration counts are recorded below. No dependencies, live data, database schema or production changed.

Review fixes include clearing previous owners without auth callbacks, deferring refresh while writes are pending, rejecting stale/loading decisions, evaluating calendar windows after slow reads, reducing the remaining window after slow writes, local-only sign-out with truthful feedback, and preventing late failed sign-in from replacing a new account.

Publication remains blocked by automatic approval review, which requires explicit authorization to publish repository contents. Task-state metadata remains in planning with null PR because the existing schema requires a positive published PR number for every implementation/blocked state. This is a documented publication exception, not a claim that implementation is absent. No validator or acceptance gate was weakened.

Remaining gates: browser layout/interaction/accessibility verification, physical Android runtime and signed-in two-user/device acceptance. Existing session persistence is retained; no encryption claim or full ME2-CLIENT-015 closure.

Final exact-source coordinator checks: full Node integration suite 121 passed, 7 skipped, 0 failed (128 total); 32 targeted Today/domain checks passed; all workspace TypeScript checks passed; Expo mobile web export passed (852 modules on the earlier cold bundle). Git whitespace check passed. Verification ran in an isolated Linux checkout copied from the D: worktree; native Android runtime and browser visual checks remain unverified. No commit, push or PR was made.

## Development web and Android distribution continuation

User explicitly authorized publishing the app and versioned APK to development only on 17 October 2026. GitHub operations must use GitHub MCP; Desktop is reserved for Antigravity edits and Android runtime/build work. The existing `dev` branch is the requested development lane; `prod` and the primary Netlify published deployment stay unchanged.

Deliver the existing core user flows as one coherent responsive web app: public home and download, login, authenticated Today with conservative shared calendar/freshness semantics and confirmed decision readback, Daily Review, account-local sign-out, and preserved bank/privacy/terms routes. Do not invent complete implementations for all future Me+ domains. No migrations or shared-data test writes. No bank activation or production deployment.

Build 0.4.0 / versionCode 6 through the designated Windows GitHub Actions runner; verify manifest, signer continuity, embedded JS, checksum and ARM64 ABI. The public download must derive from verified build metadata, show full version and filename, and never label an old APK as the new version. Existing 0.3.1 may remain available with its actual version while building.

Implementation sequence: publish current reviewed mobile checkpoint via GitHub MCP and draft PR into dev; build Android on committed source; implement web pages/styles and metadata-driven download; run types/tests/web/mobile bundles and browser visual/denied-state checks; integrate verified APK bytes via the existing Actions publication job; merge only current green head to dev; verify dev URL and downloaded APK bytes. No `--prod` or prod merge.
