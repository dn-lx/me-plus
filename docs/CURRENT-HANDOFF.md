# Current Handoff

**Last updated:** 2026-10-17
Canonical specs: Google Drive. Operational state: Supabase. Implementation/checks: GitHub.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ME2-APP-019",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/health-sync-three-hour",
  "pr": 81,
  "status": "blocked",
  "last_verified_sha": null,
  "next_step": "Restore designated Windows Actions runner and Supabase migration connector; build candidate and verify physical-phone sync before dev publication.",
  "updated_at": "2026-10-17T16:20:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current task
- User selected ChatGPT/Codex as builder, preserving Me+ 2.0 design with three-hour phone sync and one-day recovery. Antigravity is optional historical tooling. Current plan and full scope/evidence: `docs/plans/ME2-APP-019-native-core-sync.md`.
- Draft PR #81 integrates PR #79 controller/tests, original v2 light core Today/Plan/Capture/Review/More, Companion icons and resilient health sync. Native target 0.4.1/code7. PR #79 remains unmerged and must not independently publish its older code6 target.
- Each due health run replays at least 24 hours, extends to last acknowledged success after longer outages, and retains interrupted checkpoints. Android schedules 180-minute minimum intervals; exact execution depends on OS constraints and permissions. Supabase existing revision keys handle duplicate retries while retaining distinct providers and corrections.
- At 0f046c1: 45 focused local tests and all workspace types pass; Expo web and Android JS exports pass. Hosted synthetic browser acceptance at 360/1363 and PostgreSQL health contracts/security pass. Policy/runtime checks found startup context exceeded budget; this handoff is condensed to fix it without weakening checks. No physical-phone acceptance yet.

## Release blockers
- Approved narrow migration `20261017145227_health_batch_unique_run_key.sql` fixes the reproduced P0001 minute-key collision causing multi-batch uploads to fail. Shared Supabase application returned Invalid or expired requestState twice; readback confirmed the repair trigger is absent. This is a connector failure, not missing authorization. Existing phone error remains unresolved live. Do not blindly retry or apply unrelated migrations.
- Designated Windows Actions host DESKTOP-RG1HH2I is online, but scoped discovery found no runner service/process/installation. Android job remains unassigned; no new APK exists. Restore/register the designated runner, then verify signer, manifest/version, immutable source SHA, ARM64, embedded JS and checksum before device tests.
- Actual authenticated two-user and Android background/reboot/offline/replay acceptance remain outstanding. Build workflow uploads verified artifacts only; distribution uses reviewed GitHub MCP changes.

## Boundaries and retained context
- Development app/APK publication authorized; no production deployment. GitHub operations use GitHub MCP only. No live synthetic records, unrelated schemas or provider activation.
- Supabase wbqnctrvxohxwiaignhg is shared by dev/prod; branch separation does not isolate data. Netlify primary published deploy remains locked. Promote dev to prod only with authorization.
- Existing verified download remains 0.3.1/code4, 44,362,126 bytes, SHA256 0b2ea0577b39bbf0a6b5f561fc49327cf50feadde827714aa71e7e60521f7c6b. Do not relabel it as the candidate.
- Dev 9997fa7 includes Companion kit from PR #82; preserve its assets and guide. Reviewed web work/evidence: `docs/plans/ME2-WEB-016-core-app-download.md`. Prior health investigation: `docs/plans/ME2-HEALTH-017-phone-sync.md`. Historical recovery: `docs/plans/ME2-NATIVE-001-contract-recovery.md`, `docs/handoffs/2026-10-07.md`.
- Original dirty Windows checkout remains untouched; optional Antigravity workspace is separate. No successful Antigravity build is claimed. Independent PRs #38/#66/#75/#77/#78 remain outside this change.
