# ME2-APP-020 — Health recovery and branded Me+ 2.0 web

Owner request: resolve the continuing phone HTTP500 and align website/app with existing Me+2.0 and Companion branding; development only. Task branch fix/me2-sync-web-brand, PR#84. GitHub writes use MCP.

## Evidence and scope
- Live19:36UTC PostgreSQL logs show source_sync_already_completed. Live catalog has the source guard but lacks the approved health batch trigger. Current connector migration call returns Invalid or expired requestState; repair is not live. Prior permission covers the narrow existing migration, not unrelated changes.
- Independent security review confirms trigger scope, unchanged RLS/ingestion permissions, source-wide leases and revision deduplication. Distinct health invocations use distinct run keys, so per-key attempt accounting no longer caps retries of an HTTP health payload. Strengthened nullable regression assertions.
- Preserve retained14Oct v2 light palette, white20px cards, blue/teal actions, five core destinations and selected Companion art. No new visual system or fabricated personal records.
- Web adds Plan, confirmed Capture and More server acknowledgements; uses current-owner auth plus RLS, bounded reads, exact owner/content readback and account-change draft cancellation. Home overview explicitly illustrative. No sensor reads from browsers.
- Native0.4.2/code8 adds five-minute interrupted-worker expiry and explicit retry; last-success watermark and queued windows remain intact. Existing0.4.1 bytes remain immutable.

## Verification and release
1. Test stale/missing/future running timestamps and unchanged success watermark; denied/account-change/exact duplicate note receipts; isolated health contracts.
2. Workspace types/builds, responsive360/desktop rendered checks, keyboard/contrast/overflow and error/empty states. Synthetic tests use no live records.
3. Compile exact native source on previously authorized hosted Windows builder; verify signer, package/code/name, ABI, embedded JS, size/SHA and source provenance before publication.
4. Merge reviewed candidate into dev only, verify ready Netlify branch deployment and versioned APK bytes. Production app deployment remains locked.

## Blockers and rollback
Supabase write connector expires requestState. No live synthetic test writes. Repair needs a working authorized migration path; do not claim uploads restored before catalog and actual server evidence. Revert app/web changes for rollback; prior installers remain available. Applying backend trigger is additive and independently reversible. Authenticated real-phone/background/reboot/offline acceptance requires the device; browser/synthetic checks cannot establish it.

## Live column-grant correction
Read-only catalog confirmed authenticated users have column-level INSERT grants but cannot set capture id/processing_status. Both prior native Capture and the initial web candidate attempted those fields. Reuse the existing server admin writer behind verified owner auth: web server action retains session/RLS readback; native POST/api/capture validates Bearer token, expected owner, UUID/content and40k body budget, fixes provenance and fields, and confirms owner/content with account checks. Client secrets/grants/schema do not change. Stable note IDs preserve retry receipts. Deploy web endpoint before distributing/installing0.4.2. Independent security review and negative owner/receipt tests required.
