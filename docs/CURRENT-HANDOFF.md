# Current Handoff

**Last updated:** 2026-10-17
Canonical specs: Google Drive. Operational state: Supabase. Implementation/checks: GitHub.

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
  "updated_at": "2026-10-17T18:30:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current task
- User selected ChatGPT/Codex as builder, preserving Me+ 2.0 design with three-hour phone sync and one-day recovery. Antigravity is optional historical tooling. Current plan and full scope/evidence: `docs/plans/ME2-APP-019-native-core-sync.md`.
- Draft PR #81 integrates PR #79 controller/tests, original v2 light core Today/Plan/Capture/Review/More, Companion icons and resilient health sync. Native target 0.4.1/code7. PR #79 remains unmerged and must not independently publish its older code6 target.
- Each due health run replays at least 24 hours, extends to last acknowledged success after longer outages, and retains interrupted checkpoints. Android schedules 180-minute minimum intervals; exact execution depends on OS constraints and permissions. Supabase existing revision keys handle duplicate retries while retaining distinct providers and corrections.
- At 0f046c1: 45 focused local tests and all workspace types pass; Expo web and Android JS exports pass. Hosted synthetic browser acceptance at 360/1363 and PostgreSQL health contracts/security pass. Policy/runtime checks found startup context exceeded budget; this handoff is condensed to fix it without weakening checks. No physical-phone acceptance yet. Final app source 1f534d1 passed all seven hosted gates, including signed APK compilation.

## Release blockers
- Approved narrow migration `20261017145227_health_batch_unique_run_key.sql` fixes the reproduced P0001 minute-key collision causing multi-batch uploads to fail. Shared Supabase application returned Invalid or expired requestState in earlier attempts and again after fresh connector diagnostics; readback confirmed the repair trigger is absent. This is a connector failure, not missing authorization. Existing phone error remains unresolved live. Do not blindly retry or apply unrelated migrations.
- User explicitly approved switching Android compilation to GitHub-hosted Windows on 17 October 20:01 Berlin. Workflow now uses windows-2022 with unchanged frozen dependency and signer/manifest/source/ABI/checksum gates. Hosted compilation and development publication succeeded; see verified installer below. Local runner is no longer a prerequisite.
- Actual authenticated two-user and Android background/reboot/offline/replay acceptance remain outstanding. Build workflow uploads verified artifacts only; distribution uses reviewed GitHub MCP changes.

## Boundaries and retained context
- Development app/APK publication authorized; no production deployment. GitHub operations use GitHub MCP only. No live synthetic records, unrelated schemas or provider activation.
- Supabase wbqnctrvxohxwiaignhg is shared by dev/prod; branch separation does not isolate data. Netlify primary published deploy remains locked. Promote dev to prod only with authorization.
- Verified 0.4.1/code7 APK built from 1f534d1 by hosted Windows run 39056735709: 44,808,768 bytes; SHA256 11eb94077f55f371d4c88c12c77ba88ebbcd45e404b104224bd5d26b7cbfa709. Signer matches 0.3.1; package/version/background permission and packaged Companion launcher image independently checked. PR #81 merged into dev at 90b8c70 and its temporary branch was automatically deleted. Netlify branch deploy 6ad3bf772a192082cc1dff91 is ready for that exact merge. Public /download selects 0.4.1; independently downloaded APK and sidecar match size/SHA. Retain prior downloads unchanged.
- Dev 9997fa7 includes Companion kit from PR #82; preserve its assets and guide. Reviewed web work/evidence: `docs/plans/ME2-WEB-016-core-app-download.md`. Prior health investigation: `docs/plans/ME2-HEALTH-017-phone-sync.md`. Historical recovery: `docs/plans/ME2-NATIVE-001-contract-recovery.md`, `docs/handoffs/2026-10-07.md`.
- Original dirty Windows checkout remains untouched; optional Antigravity workspace is separate. No successful Antigravity build is claimed. Independent PRs #38/#66/#75/#77/#78 remain outside this change.

- APK publication uses six bounded binary parts because the GitHub connector rejects request bodies over 16 MiB. Pre-Next assembly verifies each part, release provenance and complete size/SHA before atomically replacing the public installer; source APK bytes are unchanged. Five negative/replay assembly tests and independent security/hash review pass.
