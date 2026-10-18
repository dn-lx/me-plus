# Current Handoff

**Last updated:** 2026-10-18
Canonical design/specs: retained Me+2.0 v2 review. Live state: Supabase. Source/checks: GitHub.

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
  "updated_at": "2026-10-18T11:00:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Development delivery
- Existing PRs38,60,66,75,77,78,79,84 merged into dev after reconciliation and exact-head checks. Preserve current native/design source; recovered historical migrations are provenance and must not be replayed.
- PR85 merged into dev at b5ca8bde0b391ec6c3699899c68a02bca2945072 after all9exact-head gates passed. ME2-HEALTH-022: complete web Companion navigation, honest per-batch upload status, signed Android0.4.2 and0.4.3 installers, automatic-sync starvation repair, Health Connect unit compatibility. Android0.4.3/code9 built successfully from b27d1ea77321fd0aad1d43efa1ec59c910928253 in hosted run39119321617. APK44,841,420bytes, SHA256749456115700cff683d565d4f894504ad7efa101f68cbd690f9f4aca9004b112; existing signer fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Distribution assembly reconstructs identical signed bytes.
- Automatic engine persists acknowledged reading hashes within fixed bootstrap windows and changes pages, preventing repeated budget-limited replay from starving the tail. Same-owner token refresh no longer cancels work. Eleven focused replay/reorder/revision/privacy tests passed independently. Actual Android background scheduling remains device acceptance.
- Supabase batch repair applied as20261018100608 health_batch_unique_run_key; unit compatibility applied as20261018101405. Real subsequent traffic:226 successful batches,0 failed after repair,7,644 raw records at last audit; no identity duplicates observed. Last receipt10:14:02UTC. This proves batch ingestion, not completion of the phone backlog or automatic scheduling.
- PR86 / ME2-HEALTH-023: owner-approved seven-day high-frequency row/payload compaction. Packed numeric/provenance receipts and daily descriptive summaries preserve late revisions and quality; corrected/referenced/sparse facts stay canonical. Independent review fixes and expanded isolated PostgreSQL contracts passed at f923dbea47ab9f455953954ab0b437d9a5208bc1. Compaction and numeric-roundtrip migrations applied as20261018110638 /20261018110635. Policy enabled, daily03:15UTC cron and service-only ACLs verified. Bounded initialrun0compacted/0failed, all7,644raw records retained. Additional post-lock FK-reference recheck is under deterministic concurrency verification; no retention deletion has occurred.

## Artemis device acceptance
- User explicitly selected https://github.com/google/artemis for Android testing. Pinned source351ca8422f7b5b54e80a9c1ce03a222e02415b6b staged at D:/MePlus/tools/artemis; dependencies and all caches/state on D:.
- Launcher D:/MePlus/tools/artemis/MePlus-Artemis.ps1; credentials file D:/MePlus/artemis-state/.env. No credentials belong in Git or chat.
- Actual Artemis doctor: Python/config/host/ADB ready; no connected authorized device/emulator and missing model API credential. User cannot connect USB and explicitly authorized cloud testing. Local Gemini key validatedHTTP200, user added Actions secret; never expose it. PR87 runs pinned Artemis against a fresh API35 Google APIs emulator and exact signed0.4.3 artifact. APK installation/launch succeeded; actual strict screen checks running. Optional scrcpy replay not installed. No Artemis app test has run.
- After device/key are ready: observe the app using Artemis, install verified0.4.3 as an upgrade without clearing data, inspect sync state and permissions, test retry/catch-up, resume/offline/token refresh and Android background scheduling with actual server receipts. Use bounded tasks and save traces on D:. Never manufacture health readings or claim physical acceptance from source/CI.

## Remaining delivery checks
- PR85 merged. Verify Netlify dev commit and HTTPS installer hash; branch deploy6ad4aa658b356a3a0171b922 is building b5ca8bde.
- PR86: verify post-lock reference race hardening, apply only its followup migration, run bounded no-op and merge into dev. PR87: inspect real Artemis outcomes/screenshots, fix actual failures and merge after checks. Physical-phone health acceptance remains separate.
- User authorized all PRs into dev and necessary shared Supabase health changes. Local writes only D:. GitHub operations MCP only. No production app promotion authorized; Netlify production deploy6ab8d3e80c341219b5881e92 remains locked.
- Temporary Netlify branch allowlist fix/me2-sync-web-brand should be removed after development publication; keep dev,v2,prod unchanged.
- Physical background/reboot/offline and authenticated two-user acceptance remain pending.

## Backend source boundaries
PR77 restored already-applied owner APIs, scoped MCP and dormant integration controls. Optional Letta/n8n/Langfuse remain disabled pending real scoped acceptance; no reasoning worker/provider activation or unrelated migration deployment. Plans: docs/plans/ME2-BACKEND-002-integrations.md and docs/plans/ME2-AGENTS-006-letta-n8n.md.
