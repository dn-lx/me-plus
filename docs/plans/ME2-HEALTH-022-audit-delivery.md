# ME2-HEALTH-022 — Health audit, sync repair and development delivery

Owner request 18 October: audit received health data, fix seven-day HTTP500 and automatic sync, deliver the retained Me+2.0 website, reduce redundant storage safely and reconcile all open PRs into dev. Local working files stay on D:. GitHub operations use MCP. Production promotion is not authorized.

## Verified baseline
PR84 at b8b20e2 passed eight hosted gates including signed Android0.4.2/code8 compilation and responsive web/native UI. Merged to dev at2bfd0f7. Existing batch-key repair applied to shared Supabase as20261018100608; catalog and real subsequent multi-batch traffic confirm repair. No live synthetic records written.

## Ordered work
1. Reconcile source/ledger provenance and finish audit of integrity, coverage, deduplication and quality. Keep private measurements and raw payloads out of public evidence.
2. Fix typed Health Connect unit aliases before the unchanged database quality gate. Test owner/source/provenance, manual corrections, ranges, replay and historical repair in isolated PostgreSQL; independently review before applying the narrow shared-database change.
3. Publish exact signed0.4.2 bytes with per-part/whole-file hashes; preserve prior installers and native source identity. Complete shared web branding on legal/bank pages and make batch acknowledgements distinct from complete phone synchronization.
4. Inspect automatic registration/catch-up and real device receipts. Android may defer scheduling. Fix demonstrated defects, version/rebuild native source if it changes; do not infer installed/background acceptance from CI.
5. Inventory redundancy using identity, source and revision semantics. No identity duplicates have been observed. Preserve source distinctions, raw evidence and manual corrections; define retention/aggregation before any destructive compaction.
6. Reconcile all open PRs with current dev, preserve useful changes, fix conflicts/checks and merge verified candidates. Superseded changes must not downgrade app versions, overwrite newer design or activate optional providers.

## Verification / rollback
Hosted quality/security/runtime checks and isolated SQL contracts; desktop/narrow browser screenshots visually reviewed. Verify Netlify exact commit and installer HTTPS size/hash after dev merge. Backend compatibility normalization is additive; raw readings/revisions remain unchanged. Revert trigger/code through reviewed follow-up if required. Production remains locked. Physical background/reboot/offline and two-user acceptance require observed device evidence.


## Delivery evidence — 18 October
- HTTP500 batch-key repair is live; real traffic reached226 completed batches with0post-repair failures and7,644records. Unit normalization is live; strict numeric-roundtrip historical repair is tracked separately in PR86.
- Automatic dense-window starvation reproduced and fixed in0.4.3/code9;11focused engine tests pass, including privacy/revision/reordering. Hosted run39119321617 built b27d1ea77321fd0aad1d43efa1ec59c910928253 successfully; APK hash749456115700cff683d565d4f894504ad7efa101f68cbd690f9f4aca9004b112 and existing signer verified. Part assembly reproduces identical bytes.
- All eight pre-existing PRs reconciled and merged into dev. Backend optional runtimes stay disabled; historical migrations not redeployed.
- User requested Google Artemis. Installed pinned351ca8422f7b5b54e80a9c1ce03a222e02415b6b on D:, actual doctor run reports device/model-key prerequisites missing. Device tests remain pending; no fabricated UI evidence.
- Owner chose raw7days then compaction; dedicated reviewed implementation tracked in ME2-HEALTH-023 / PR86, separately gated before deletion.
