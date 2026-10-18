# Integration setup with authorization deferred

Date: 2026-10-16. Continuation of ME2-BACKEND-002 and ME2-CONNECT-003. The user will authorize providers later and asked to finish all other integration setup. Keep all external ingestion inactive, preserve the fresh database and do not publish a new app/website or provision paid/optional hosts.

## Deployed

Migration `20261016121130_meplus2_integration_control.sql` adds the owner-authenticated integration control API, private proof/activation/audit records and fixed provider runtime registry. Google Calendar v19 and Health Sync Drive v28 implement its service-only authorization callback. Applied bootstrap runtime labels were updated operationally after these worker deployments to `calendar-v19-auth-proof-v1` / `healthsync-v28-auth-proof-v1`.

| RPC | Contract |
| --- | --- |
| get_meplus_integration_status() | Own source readiness, recent probe/sync status, clock state, safe agent token counts/tool-use evidence and Health Connect status. No credentials, provider IDs, folder IDs or arbitrary metadata. |
| request_meplus_integration_probe(provider, request_id) | Fixed Google providers only; UUID request identity; queued proof bound to own source and provider; 2-minute expiry, 1-minute cooldown. Vault-backed wake secret never leaves the server. |
| set_meplus_integration_state(provider, mode, request_id) | Modes pause/start/enable_clock; owner-only, stable UUID receipts. Start requires a fresh server-recorded authorization proof and history cutoff. Clock enable additionally requires successful own-source database sync evidence after the private activation timestamp. |
| server_record_meplus_integration_probe(probe_id, provider, authorized) | Service-role only; consumes a pending, matching, unexpired nonce exactly once. Google workers call after their own wake-secret check and actual OAuth refresh result. No caller-supplied timestamp or user ID. |

Provider identifiers: google-calendar-supabase, google-drive-healthsync, enable-banking. N26 start/clock controls are intentionally deployment_pending until the prepared worker is actually rolled out and its consent path verified. No authenticated client can flip the private deployed flag. Optional Letta/n8n access shares the existing scoped tools; an issued token is not proof that a host/runtime is connected. Actual successful tool access is reported separately.

Probe request, pause/start/enable and clock runner serialize on the same provider advisory lock. Existing Google workers have one server OAuth account per provider, so controls fail closed if a second owner is configured. Pause affects only the caller's source and does not disable another owner's global clock. An already queued/running sync can finish after pause; this is not an in-flight cancellation API. The cron runner also checks the owner's local 06:00–22:00 before dispatch. UTC schedules currently cover Berlin across DST; broader timezone coverage requires widening the UTC schedule.

All three external clocks remain inactive and all sources pending_authorization. Callback smoke recorded two real authorization_required results without requesting user sign-in or importing provider data. The fresh database retains one profile and no task/routine/recommendation/token/sync test records.

## Later authorization sequence

1. Renew Google credentials securely through the existing provider/Edge Secrets setup. Do not paste them in chat or source.
2. As the signed-in owner, request the provider probe with a new UUID. Poll status until authorized. Proofs older than 15 minutes cannot start a connector. A nonce cannot be forged through an authenticated client or reused after callback/expiry.
3. Call mode=start with a stable new UUID. It activates only that source and queues one initial sync; it does not enable recurring ingestion. Keep this request ID for retries.
4. Inspect readiness/last sync. Only a genuine completed source_sync_run begun after activation plus protected last_sync_at can enable its clock. Failures leave the clock off. Call mode=enable_clock with a new stable UUID after success.
5. To pause, call mode=pause with a new UUID. A stale retry of a prior start returns its receipt without undoing the pause. Re-authorization/disconnect revocation at Google is separate from local scheduling pause.

The activation API is ready for the later UI. No real provider was activated as part of this continuation.

## N26 rollout artifact and remaining capability limit

The connected Netlify tools can inspect deployments/projects but expose no deployment mutation. The current environment has neither an authenticated Netlify CLI token nor site configuration. No credential was read, minted or copied. Existing production deploy is locked; it was not changed. Do not move dev/prod refs simply to trigger an assumed build; no Netlify commit status or Git CD verification supports that path.

Prepared a real functions-only build using @netlify/zip-it-and-ship-it 16.3.0, supabase-js 2.117.2 and esbuild 0.28.1, pinned with a separate build-tool package lock under tooling/backend-build. It bundles the existing N26 worker/history guard and protected runtime diagnostic. Diagnostic now exposes backendContract=n26-history-cutoff-v1 only after scheduler authentication; background mode is explicit. No app build or deploy is needed to produce the package.

Reproduce from repository root:

```sh
npm ci --prefix tooling/backend-build --ignore-scripts --no-audit --no-fund
MEPLUS_BACKEND_BUILD_MODULES="$PWD/tooling/backend-build/node_modules" node scripts/build-backend-functions.mjs
node scripts/verify-backend-functions.mjs
```

Output is dist/backend-functions/archives: two ZIPs, official functions manifest and SHA-256 checksums. The existing backend-readiness workflow builds/uploads the same artifact without production credentials. Verification checks actual extracted ZIP payloads, API2 entrypoint/bootstrap presence, Node24/background metadata, archive checksums, and missing/invalid-secret denial without network access. It does not emulate hosted Netlify Lambda execution or prove a deploy occurred.

When authenticated deployment capability is available, deploy the prepared functions through a supported functions-only path that preserves the existing site's assets/settings. Verify the hosted protected diagnostic marker, unauthorized denial and provider-bound source history behavior. Only then mark the private N26 runtime deployed, obtain new bank consent, verify a fresh-only sync and enable the daily clock. The N26 worker itself remains **not deployed**, and its recurring clock is **off**. Existing source ingestFromDate starts on the next Berlin day after the reset to respect day-granularity bank records.

## Verification and source safety

- Independent security review found no blocker in controls/callbacks/build preparation.
- Node suite: 112 passed, 7 pre-existing skipped, zero failures.
- Integration control SQL passed the isolated PostgreSQL fixture along with auth/native actions/routines/scoped client suites; the new hosted workflow runs the same contracts on PostgreSQL17.6.
- Live-schema rollback passed ownership denial, nonce provider binding/replay/expiry, service-only proof recording, no-proof/no-sync gates, start/pause retry safety and N26 deployment gate. Hosted test reuses the sole pending source entirely inside a rollback transaction; a synthetic second-owner positive flow correctly fails the global-account guard. No positive test proof, activation, cron change or sync run was committed.
- Both deployed workers returned 401 without wake secrets; actual owner-bound callback requests returned authorization_required within nonce expiry. These are failed-authorization results, not new consent or successful provider sync.
- Functions ZIP build and extracted-payload denied checks passed locally; no environment files were included. Build never substitutes runtime environment values.
- Focused N26 source/dependency strict typecheck passed. Documentation/version/diff validation passed before persistence. Inspect the current final SHA's hosted workflow for the final CI/artifact result.
- Advisor warnings remain the intentional owner-scoped SECURITY DEFINER surface, private deny-by-default RLS and the pre-existing password-protection setting documented in ME2-BACKEND-002.

Rollback: disable external clocks (already off), retain proofs/control receipts/audits, restore the prior Google worker version if necessary, and revert RPC bodies only with additive migrations. Do not drop canonical data or replay already-applied migrations. The runtime private deployed flag is operational verification evidence, not an app-controlled preference. Optional Langfuse/Letta/n8n hosts remain deferred by the accepted selective-adoption/privacy/recovery gates; no paid infrastructure or duplicate AI clock was introduced.
