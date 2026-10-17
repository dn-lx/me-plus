# Current Handoff

**Last updated:** 2026-10-17
Canonical specs: Me+ Google Drive. Operational state: Supabase. Current implementation/checks: GitHub.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": null,
  "repository": null,
  "base": "dev",
  "branch": null,
  "pr": null,
  "status": "idle",
  "last_verified_sha": null,
  "next_step": null,
  "updated_at": "2026-10-17T14:20:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Development handoff
- User authorized web app/APK publication to development only. All coordinator GitHub writes use GitHub MCP. No prod, schema, live-data test writes or provider activation.
- ME2-WEB-016 separates the core responsive web app and verified existing Android download from pending native work. Plan: `docs/plans/ME2-WEB-016-core-app-download.md`.
- Mobile PR #79 at c887843 targets 0.4.0 / versionCode 6 / me-plus-0.4.0.apk. Four hosted checks green; Android run 39038848460 queued because designated Windows runner DESKTOP-RG1HH2I is offline. No installed runner was found to restart. New APK is not built or available.
- Existing 0.3.1 APK remains labeled with its actual version/code/hash. Web build validates metadata and bytes; no relabeling to 0.4.0. Native/authenticated two-user acceptance remains pending.
- Antigravity workspace `D:\Development\me-plus-antigravity`; original dirty `D:\Development\me-plus` untouched. Approved telemetry path repair retained the hook.

## Release boundaries
- Promotion `dev → prod`; no current production approval. Netlify primary published deploy is locked. Supabase project wbqnctrvxohxwiaignhg is shared by dev/prod; branches do not isolate records.
- Android compiles on designated Windows Actions runner; Netlify distributes verified bytes. Verify manifest/code/name, source SHA, embedded JS, ARM64 ABI, signer continuity and checksum.
- Dev cf90a19 includes PR #76 native retry repair source, not its live deployment. Never blindly replay recovered migrations. PR #69 restricted privileged RPCs; #70–#74 added Today/Now/Review/atomic decisions.
- Independent PRs #38/#66/#75/#77/#78 remain outside this task. Prior evidence: `docs/handoffs/2026-10-07.md`, `docs/plans/ME2-NATIVE-001-contract-recovery.md`.

## Web PR #80 review
- Web-only source: no native application or version bump; shared new ranking helpers are not exported by the existing native package entrypoint. The Android path filter still queues a build for shared-package additions; its offline status is not evidence that a new native APK exists.
- Before final documentation/CSS commit: 117 passed, 7 skipped, 0 failed; all workspace typechecks and Next.js build passed. Four hosted checks green at d526bcc; branch deployment 6ad383242f5e5cb9be99924c ready for that SHA. Final head requires fresh checks.
- Browser at available 500 CSS-pixel viewport: Home and Download render without horizontal overflow; version, code, filename, size and SHA shown; Today redirects to login with safe next; blank sign-in focuses the required email field. Only browser-extension metadata errors observed. Full desktop/360px, authenticated Today/Review interaction and physical Android remain unverified.
- Final development publication is authorized; prod and primary published deploy stay unchanged. Temporary feature branch deployment allowance must be removed after dev verification. Deployment/evidence details in the task plan.

The preview APK was downloaded independently over HTTPS and its SHA-256 exactly matched committed provenance: `0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b` (44,362,126 bytes, version 0.3.1). New 0.4.0 remains unavailable.
