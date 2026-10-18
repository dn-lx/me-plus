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
  "updated_at": "2026-10-18T00:00:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current delivery
- PR#84 / ME2-APP-020: website aligned with native v2 light design and Companion logo/icons. Today, Plan, Capture, Review, More. Capture confirms exact owner/content; drafts clear on account changes. More reads owner-scoped server upload acknowledgements. Plan/evidence: docs/plans/ME2-APP-020-sync-web-brand.md.
- Native target0.4.2/code8: expire interrupted running state after5minutes and explicit retry. Saved cursors/replay windows and last successful acknowledgement remain intact. A newly compiled/verified artifact is required; do not relabel0.4.1.
- Dev-only app publication authorized. GitHub operations MCP only. Supabase projectwbqnctrvxohxwiaignhg is shared; no production app merge/deployment or unrelated schema/live test writes.

## Unresolved health upload blocker
- Live19:36UTC logs17October: source_sync_already_completed. Readback: approved a_health_batch_run_key_before_insert trigger still absent. Fresh apply_migration again fails Invalid or expired requestState. Connector reads work. Root-cause repair is not live; do not claim uploads fixed. Narrow migration already owner-approved; alternate browser fallback needs user approval under browser connector policy.
- Existing reviewed migration20261017145227_health_batch_unique_run_key.sql gives distinct health batch run keys while source leases and raw revision deduplication remain. Independent review found no migration blocker; nullable SQL assertions strengthened. No unrelated migrations may be applied.

## Verified previous installer
- Published0.4.1/code7 built from1f534d1;44,808,768bytes;SHA25611eb94077f55f371d4c88c12c77ba88ebbcd45e404b104224bd5d26b7cbfa709. Companion launcher independently checked. Dev distribution uses six parts and fail-closed assembly. Prior details:docs/plans/ME2-APP-019-native-core-sync.md.
- Android hosted Windows builder authorized17October; no local runner prerequisite. Netlify primary production deploy6ab8d3e80c341219b5881e92 stays locked. Promote dev→prod only with specific approval. PR#79 older0.4.0 remains superseded/unmerged.
- Physical phone/background/reboot/offline and actual authenticated two-user acceptance remain pending. Synthetic browser/SQL checks cannot establish device acceptance.
- Temporary Netlify branch allowlist fix/me2-sync-web-brand for exact-head preview must be removed after development publication; keep dev,v2 and prod unchanged.
