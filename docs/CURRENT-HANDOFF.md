# Current Handoff

**Last updated:** 2026-10-17
Canonical specs: Me+ Google Drive. Operational state: Supabase. Current implementation/checks: GitHub.

<!-- AGENT_TASK_STATE_START -->
{
 "task_id":"ME2-WEB-016", "repository":"dn-lx/me-plus", "base":"dev",
 "branch":"feature/me2-web-download", "pr":null, "status":"planning",
 "last_verified_sha":null,
 "next_step":"Open web draft PR, verify current CI and preview, then deploy dev only. Mobile APK is blocked on offline Windows runner.",
 "updated_at":"2026-10-17T14:15:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Active work
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
