# Current Handoff

**Last updated:** 2026-10-17

Canonical requirements are in Me+ Google Drive, operational state in Supabase, and current source/checks in GitHub. Branches do not isolate the shared database.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ME2-CLIENT-015A",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "feature/me2-mobile-today",
  "pr": 79,
  "status": "implementing",
  "last_verified_sha": null,
  "next_step": "Finish core web UI/download; run CI, browser checks and verified 0.4.0 Android build; deploy dev only.",
  "updated_at": "2026-10-17T14:01:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Active work

- User authorized development publication, web app and versioned APK. All coordinator GitHub operations use GitHub MCP. Desktop use is limited to Antigravity edits and Android build/runtime work for this task. No production publication or prod merge.
- PR #79: native Today first slice, owner-scoped bounded reads, conservative Now/guidance and confirmed action decisions. Version 0.4.0 / Android versionCode 6 / `me-plus-0.4.0.apk`. Original dirty `D:\Development\me-plus` remains untouched; Antigravity writes isolated `D:\Development\me-plus-antigravity`.
- Initial local verification: 121 passed, 7 skipped; 32 targeted checks; all workspace types and Expo web export passed. CI found dependency-free test resolution and startup-budget issues; repairing imports and compacting this handoff. No green claim for the next commit until rerun.
- Android run 39038658084 queued; designated Windows runner reported offline. Web work adds coherent Home/Login/Today/Review navigation, account-local sign-out and metadata/hash-verified download. Never relabel the existing 0.3.1 APK as 0.4.0.
- Antigravity telemetry path quoting repaired with user approval; hook retained. No credentials, schema, live test writes or provider activation.
- Plan/evidence: `docs/plans/ME2-CLIENT-015A-mobile-today.md`. Physical phone, authenticated two-user acceptance and full session hardening remain separate gates; current persistence is not claimed encrypted.

## Existing development and release boundaries

- PR #76 merged as dev `cf90a19`: exact native contract recovery and retry repair; live additive repair remains undeployed. Follow `docs/plans/ME2-NATIVE-001-contract-recovery.md`; never replay recovered migrations blindly.
- PR #69 SEC-008 merged and privileged denial verified live. PRs #70–#74 added Today/Now/Review and atomic decisions. PRs #38, #66, #75, #77, #78 are independent; do not merge them opportunistically.
- Shared Supabase project: `wbqnctrvxohxwiaignhg`. User sessions + owner scope + RLS enforce client access. Do not use service credentials for client surfaces or live data for synthetic acceptance.
- Promotion remains `dev → prod`; explicit current-release approval is required for production. Keep primary published Netlify deploy and prod branch unchanged.
- Android compiles on the designated Windows Actions runner; Netlify only distributes verified APK bytes. Check manifest/version, signer continuity, embedded JS, ARM64 ABI, SHA-256 and source provenance.
- Previous ENG-007/Android evidence: `docs/handoffs/2026-10-07.md`. Broader canonical architecture and prepared backend work are documented in their own PRs/plans.
