# Current Handoff

**Last updated:** 2026-10-18
Canonical design/specs: retained Me+2.0 v2 review. Live state: Supabase. Source/checks: GitHub.

<!-- AGENT_TASK_STATE_START -->
{
  "task_id": "ME2-HEALTH-022",
  "repository": "dn-lx/me-plus",
  "base": "dev",
  "branch": "fix/me2-health-audit-delivery",
  "pr": 85,
  "status": "implementing",
  "last_verified_sha": "2bfd0f76149290257dcc13148f369b15155e7a74",
  "next_step": "Isolated health unit compatibility tests, immutable installer delivery, automatic sync and PR reconciliation.",
  "updated_at": "2026-10-18T10:20:00Z"
}
<!-- AGENT_TASK_STATE_END -->

## Current delivery
- PR#84 / ME2-APP-020: website aligned with native v2 light design and Companion logo/icons. Today, Plan, Capture, Review, More. Capture confirms exact owner/content; drafts clear on account changes. More reads owner-scoped server upload acknowledgements. Plan/evidence: docs/plans/ME2-APP-020-sync-web-brand.md.
- Native target0.4.2/code8: expire interrupted running state after5minutes and explicit retry. Saved cursors/replay windows and last successful acknowledgement remain intact. A newly compiled/verified artifact is required; do not relabel0.4.1.
- Dev-only app publication authorized. GitHub operations MCP only. Supabase projectwbqnctrvxohxwiaignhg is shared; no production app merge/deployment or unrelated schema/live test writes.

## Health upload repair applied
- Reviewed batch trigger applied18October as20261018100608 health_batch_unique_run_key. Catalog confirms ordering/privileges; real subsequent multi-batch uploads succeed with health_batch keys. No live synthetic writes.
- Audit found typed Health Connect unit aliases disagree with quality-gate units; compatibility fix and isolated tests in progress. Raw payloads/corrections stay intact.
- Current work/evidence: docs/plans/ME2-HEALTH-022-audit-delivery.md. PR84 is merged; Android0.4.2 exact-source build39083754192 succeeded. Distribution remains pending until reviewed part manifest and verified HTTPS bytes.

## Verified previous installer
- Published0.4.1/code7 built from1f534d1;44,808,768bytes;SHA25611eb94077f55f371d4c88c12c77ba88ebbcd45e404b104224bd5d26b7cbfa709. Companion launcher independently checked. Dev distribution uses six parts and fail-closed assembly. Prior details:docs/plans/ME2-APP-019-native-core-sync.md.
- Android hosted Windows builder authorized17October; no local runner prerequisite. Netlify primary production deploy6ab8d3e80c341219b5881e92 stays locked. Promote dev→prod only with specific approval. PR#79 older0.4.0 remains superseded/unmerged.
- Physical phone/background/reboot/offline and actual authenticated two-user acceptance remain pending. Synthetic browser/SQL checks cannot establish device acceptance.
- Temporary Netlify branch allowlist fix/me2-sync-web-brand for exact-head preview must be removed after development publication; keep dev,v2 and prod unchanged.
