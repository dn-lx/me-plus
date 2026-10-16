# Me+ 2.0 backend and integrations checkpoint

Date: 2026-10-16. Source branch: `feature/me2-backend-integrations`, based on dev `cf90a19`. User authorized live DB/integration completion and explicitly waived Supabase PRs; app/website publication remains deferred. This is a minor feature addition under Unreleased, with patch-level repairs included.

## Delivered and verified

- Auth signup now creates the existing personal profile correctly; the deleted marketplace `primary_role` field is no longer referenced. Untrusted metadata never grants a role; timezone is validated against PostgreSQL timezone names.
- Native create/reschedule no-op retry repair applied as live version `20261016084240`. Its existing Git filename `20261016083256` predates application; do not replay it. Recovered historical create/reschedule migrations are also already applied.
- Owner-authenticated routine definition/update, append-only change history, feedback 1–5/follow-through and retry receipts are deployed. Daily, weekly ISO weekdays and once recurrence are deterministic. Existing occurrence snapshots survive later definition changes. Windows are availability, not calendar bookings. Ordinary windows stay within 06:00–22:00 in the profile timezone.
- Native routine materialization uses existing canonical action/routine execution logic. A private cron runs half-hourly in a UTC superset of Berlin waking hours, checking profile-local 06:00–22:00 before heartbeat/work. It calls no AI model or external task surface. Empty configuration creates no tasks. Arbitrary timezone coverage would require widening the UTC clock; current owner is Europe/Berlin.
- Scoped client registry/dispatcher and bounded owner workspace read are deployed. Opaque 256-bit credentials are hashed at rest, expire in 1–90 days, are revocable, and have fixed operation/data scopes, private audit and per-minute rate limits. No SQL, finance transactions, treatment changes or arbitrary external effects are available.
- `me-plus-mcp` v1 is deployed. It provides read_state/create_task/edit_task/reschedule_task/complete_task/rate_recommendation. Streamable HTTP JSON, pinned supported protocol revisions 2025-03-26/2025-06-18/2025-11-25, no sessions/SSE. This is manually configured bearer authentication, **not OAuth** and not a connected ChatGPT app. Tools/list only exposes granted operations; SQL enforces the final owner and data scopes.
- Health Sync Drive v27 and Google Calendar v18 are deployed with pinned supabase-js 2.117.2, authenticated boolean-only auth probes and source `ingestFrom` cutoffs. Calendar platform JWT verification is disabled because its own DB-validated wake secret authenticates requests; this fixes publishable-key-as-JWT rejection. Health auth failure explicitly merges source metadata; an existing DB trigger also preserves metadata.
- Three configured source records are `pending_authorization`, with fresh-start cutoffs and no last_sync_at. Health Sync's eight actual Drive folders were verified by metadata, then configured privately in Supabase. No folder IDs or credentials are committed here.
- Calendar/Health Sync/N26 cron definitions are installed **inactive**. No old reasoning, AI polling or Todoist clocks were restored. N26 runs daily when enabled; optional runtimes remain off.

## Applied migration provenance

| Live version | Source migration |
| --- | --- |
| 20261016084240 | 20261016083256_meplus_native_action_replay_receipts.sql |
| 20261016084425 | 20261016084425_meplus2_auth_profile_bootstrap_fix.sql |
| 20261016085920 | 20261016085920_meplus2_native_routines_feedback.sql |
| 20261016114024 | 20261016114024_meplus2_scoped_client_registry.sql |
| 20261016114053 | 20261016114053_meplus2_scoped_client_dispatch.sql |
| 20261016114527 | 20261016114527_meplus2_native_scheduler_clock.sql |
| 20261016114835 | 20261016114835_meplus2_dormant_connector_clocks.sql |

The scoped migration was split into registry and dispatcher after two tool request-state failures. History and catalog checks showed the combined migration had not applied; both split applications succeeded. The source files match these applied units.

## Acceptance evidence

- Node integration suite: 111 passed, 7 pre-existing skipped, 0 failed (118 total).
- Strict TypeScript, including noUncheckedIndexedAccess/exactOptionalPropertyTypes: MCP transport, shared ingestion window, N26 history helper passed. N26 ingestion and its real imported dependencies passed a focused typecheck using the repository compiler settings and exact pinned dependency versions.
- Disposable PGlite/PostgreSQL accepted the actual table columns/checks, real routine materializer, auth bootstrap hook and new migrations; all three rollback acceptance suites passed. CI reproduces these contracts on PostgreSQL 17.6 via `meplus-backend-readiness.yml`.
- Live-schema rollback suites passed for auth/bootstrap/native actions, routine/feedback and scoped clients. Covered invalid metadata, ownership denial, anonymous denial, daily/weekly/once, Berlin DST, disabled/non-native schedules, rating correction history, token scopes/expiry/revocation/rate limits, request identity restoration and partial→completed→stale-partial replay. Synthetic users, actions, ratings and tokens were rolled back.
- Independent security review: no remaining blocking source issue across database, MCP, connectors and clocks. N26 malformed preferred-date handling was tightened after review, with regression coverage. N26 source is not yet deployed.
- Hosted smoke: MCP GET 405, no credentials 401, syntactically valid unknown opaque token 401, unapproved Origin 403. Both Google workers reject missing wake secrets with 401. Authenticated Google auth probes each return 502 authorization_required without importing data. No hosted positive MCP token/client session or signed-in app E2E is claimed.
- N26 secret-protected runtime diagnostic returns 200 and confirms required configuration presence by booleans only. This is not proof of an active bank consent/session.
- Final live counts: one real profile; zero actions, routines, recommendations, client tokens or source sync runs. Exactly three pending integration source configurations. V1 personal data was not restored.
- Security advisor: intentional owner-scoped SECURITY DEFINER RPC warnings and private deny-by-default RLS notices reviewed. Existing leaked-password protection remains disabled; enabling availability/plan support was not verified. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Scoped-client setup for the later UI/client stage

Endpoint: `https://wbqnctrvxohxwiaignhg.supabase.co/functions/v1/me-plus-mcp`.

A signed-in owner calls `create_meplus_client_token(client,label,operations,data_scopes,days)` via the normal Supabase user session. Client is mcp/letta/n8n. Start read-only with read_state and only necessary sections. The plaintext token is returned once; put it directly in the client's secure credential store as `Authorization: Bearer …`. Never paste it into chat, source, screenshots or observability. `list_meplus_client_tokens()` returns metadata only; `revoke_meplus_client_token(token_id)` revokes an owned token. No real owner token was minted during this work. UI access/security E2E remains a later acceptance gate. A tool execution consumes two SQL rate hits (capability check plus execution), allowing roughly 60 tool calls/minute at the current 120-hit window.

Owner UI RPCs: get_meplus_workspace(sections,limit), save_meplus_routine(input), refresh_meplus_schedule(), create_meplus_native_action(input), reschedule_meplus_native_action(id,input), record_meplus_action_decision(id,decision), record_meplus_feedback(input). Mutating routine/feedback/client tools require stable UUID request IDs. Native task contracts are in the migrations and rollback tests. User identity is always derived from authentication, never supplied by the external tool.

## Remaining connection/activation gates

| Integration | Actual state | Required next step |
| --- | --- | --- |
| Health Sync Drive | Worker/config ready; Google authorization unavailable | Renew GOOGLE_HEALTHSYNC_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN securely in Supabase Edge Function Secrets; auth_probe must succeed, then activate the pending source and verify one fresh-cutoff sync before enabling its cron. |
| Google Calendar | Wake authentication repaired; Google authorization unavailable | Renew GOOGLE_CALENDAR_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN securely; verify auth_probe and selected calendar read access. Activate source, verify a bounded snapshot, then its clock. Ongoing/all-day commitments spanning the cutoff may be retained because Google timeMin filters by event end. |
| N26 / Enable Banking | Runtime/config present; no active consent/session | Roll out this branch's history-preserving N26 ingestion to the backend worker **before** reconnect. Then fresh bank consent. Pending source uses the next local day as the earliest date, because bank dates have day precision. The worker guard handles a future start without asking for dateFrom later than dateTo. Keep cron disabled until a successful fresh-only run. |
| Health Connect | Existing ingestion backend; no post-reset device evidence | During app stage, sign in on a real Android device, grant permission, upload and retry; verify canonical records. No fake device source was created. |
| MCP / Letta / n8n | Scoped contracts ready; no real client token issued | Configure the chosen client securely. OAuth-style ChatGPT connection is additional work if required by its client. Letta/n8n hosts/accounts are optional, not provisioned. |
| Langfuse | Optional exporter PR #75 remains deferred | Separate exporter from unrelated routing/model changes; verify region, retention/deletion and synthetic canary before enabling any export. No production export was enabled. |

Letta requires a measured improvement plus backup/restore/fallback acceptance before persistent production use. Temporal remains deferred. Existing worker v41/gateway v26 baseline remains unchanged. No paid infrastructure was provisioned. Do not mark these optional runtimes connected or require them for core correctness.

## Rollback and compatibility

Stop the native clock with cron.alter_job(active:=false) if needed. External clocks are already inactive. Revoke client tokens and remove the MCP endpoint to disable external tools; retain audit/receipts/history. Restore prior Google worker versions and verification settings as a matched deployment if rollback is required, understanding that Calendar's prior JWT gate rejected modern publishable-key wakes. Restore prior RPC bodies through additive reviewed migrations if necessary; do not drop canonical tables, wipe user records, replay historical data migrations or delete audit history. New routine schedule enabled defaults false, so legacy schedules were never silently adopted. No prod Git merge or website/app release occurred.


## Authorization-deferred follow-up

Current controls/callbacks and N26 rollout preparation are in ME2-INTEGRATIONS-004-control-and-rollout.md. Google workers are now Health Sync v28 / Calendar v19; migration20261016121130 adds the owner control API. Provider authorization remains pending; N26 ZIPs are built but deployment capability is unavailable in the current connection. Earlier versions/counts above describe the first checkpoint.
