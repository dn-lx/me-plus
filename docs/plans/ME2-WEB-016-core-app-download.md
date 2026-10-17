# ME2-WEB-016 — Core web app and verified Android download

## Outcome and boundaries
User authorized a complete core web experience and APK download on development only (17 October 2026). Target `dev`; preserve prod and the locked primary deployment. Coordinator GitHub operations use GitHub MCP. No database/schema/provider changes or live-data test writes.

Existing web routes already implement owner-authenticated Today, ratings and Daily Review; the homepage lacked entry points and APK distribution. Preserve these contracts and bank/privacy/terms routes. Do not claim all future Me+ roadmap domains are complete.

## Implementation
- Connect Home/Login/Today/Review/Download through shared navigation, dark mint tokens, responsive layouts, visible focus and touch targets.
- Reuse shared platform-neutral calendar/ranking/freshness logic. Calendar invalidity/failure suppresses Now; timestamps are evaluated after reads and labeled Europe/Berlin. Authenticated bounded reads retain owner filters/RLS.
- Action decisions use existing atomic RPC; owner-filtered readback must match id/status before success. Dependency-free pure-handler tests include denied callers, stale results and exceptions.
- Build-time static download discovery validates metadata, strips the Windows UTF-8 marker, checks APK bytes, size and SHA-256 plus sidecar; full actual version/code/name are shown. Do not rename or relabel an old APK.
- Preserve existing native session adapter and privileged/server boundaries. Sign-out is local to this client; no encryption claims.

## Android separation
Mobile PR #79 targets 0.4.0 / versionCode 6 / `me-plus-0.4.0.apk`. Its four hosted checks pass at c887843. Android run 39038848460 is queued because registered Windows runner DESKTOP-RG1HH2I is offline. Scoped host inspection found no runner service/process or installed run.cmd/.runner pair to restart. Do not replace this with an unverified build or fabricate release metadata. This web PR keeps the verified 0.3.1 installer available with its real provenance; the new build remains pending.

## Verification and rollout
Antigravity authored the web slice in the isolated D: worktree; coordinator independently repaired type interfaces, strict UUID test fixtures, Windows metadata parsing, build tracing, truthful labels and reusable Now selection. Dedicated clean web checkout is based on current dev cf90a19 and excludes unbuilt mobile changes and the 0.4.0 version bump.

Initial web types/build and 22 focused cases passed before the last checksum/cleanup changes. Final exact-source CI and browser evidence must be recorded below. Browser and signed-in two-user acceptance must not be inferred from Node tests.

Netlify has production branch prod (locked), branch deploys dev/v2, pull-request previews disabled. Temporarily allow only this feature branch for pre-merge browser review, retaining prod and existing branches. Merge current green verified head to dev using GitHub MCP; verify dev deployment, logged-out redirects and actual download. Remove the temporary preview allowance afterwards. Fix forward in dev if necessary; no production deployment or schema rollback.

No new dependencies, analytics or motion runtime. Static pages compute checksum during build so large APK files remain ordinary downloads outside client JS. Inspect bundle/output size and browser overflow/focus/console. Physical phone and authenticated two-user acceptance remain pending; no native completion claim.

Draft PR #80 created via GitHub MCP. Temporary preview allowance for feature/me2-web-download was verified against the real GitHub branch; prod remains prod and PR-wide previews remain disabled. Native changes and version bump are excluded from this web PR.

## Verification packet
- Isolated clean web checkout: full integration suite 117 passed / 7 skipped / 0 failed (124 total), all workspace TypeScript checks passed, Next.js production compile and static generation passed; 22 focused web tests passed. No new runtime dependency.
- Four GitHub hosted gates green at d526bcc. Netlify branch deployment 6ad383242f5e5cb9be99924c ready and matched to that SHA; primary production deployment remains locked and unchanged.
- Browser on actual available 500 CSS-pixel viewport: Home/Download/Login rendered and inspected; no horizontal overflow, main-nav targets 44px, exact `me-plus-0.3.1.apk`, version 0.3.1/code4, checksum and size. Today denied redirect and required-field validation verified. Footer touch targets subsequently increased to 44px. Browser console errors were extension metadata errors, not app errors. A browser download attempt was canceled; HTTP byte verification is checked separately.
- Explicit limits: wider desktop/360px responsive matrix, authenticated live Today/Review decisions/ratings/sign-out, full failure-state UI matrix, physical Android and two-user E2E are pending. Node fixtures prove handler contracts; they do not replace these runtime checks. This is a development delivery, not a full product or production acceptance claim.
- Final documentation/CSS head must rerun current CI before dev merge. Plan rollback is a reviewed fix-forward source change; no schema changed.

The preview APK was downloaded independently over HTTPS and its SHA-256 exactly matched committed provenance: `0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b` (44,362,126 bytes, version 0.3.1). New 0.4.0 remains unavailable.
