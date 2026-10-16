# Me+ 2.0 architecture audit

**Date:** 17 October 2026, Europe/Berlin
**Task:** ME2-ARCH-007
**Scope:** planning and documentation. No application, database, provider, runtime, dependency or deployment changes.

## Assessment

Keep the existing TypeScript monorepo and Supabase core. The main need is to finish and reconcile the system already present: its contracts, source provenance, delivery pipeline, owner controls and real acceptance. A new agent framework or database would add operational work before addressing these gaps.

The recommended target is a modular application with thin web/mobile clients, explicit user and machine authentication adapters, shared capability contracts, PostgreSQL-owned invariants, provider adapters and durable background work. See [architecture](ARCHITECTURE.md), [proposed ADR](adr/0002-meplus2-modular-core-and-adapters.md), [roadmap](ROADMAP.md) and [banking plan](plans/ME2-BANK-012-n26-ing.md).

The user's latest direction adds **both N26 and ING** to required delivery. This supersedes the earlier deferral of N26 for planning priority. Provider consent, spending and rollout still require their own later actions; planning does not activate anything.

## Evidence and limits

| Evidence | What was checked | Interpretation |
| --- | --- | --- |
| Current development source | `dev` at `cf90a19274c7eeecfe8e4e95d321415935485612` | Baseline for this documentation branch |
| Prepared backend source | [PR #77](https://github.com/dn-lx/me-plus/pull/77), head `43359075485c2f68d8d921d677ba0e423623e3ad`, 11 commits ahead of current dev | Open draft; prepared implementation is not yet consolidated into dev |
| Backend CI | Five final-head workflows successful; [backend evidence](https://github.com/dn-lx/me-plus/actions/runs/38908165827) | Tests support the prepared contracts, not real provider/device acceptance |
| Mobile work | [PR #38](https://github.com/dn-lx/me-plus/pull/38), head `6e857785c6585cf1c6132fc4efa89c2617b85215` | Separate pending foreground-sync implementation, artifact and database dependency |
| Other proposals | Open [PR #66](https://github.com/dn-lx/me-plus/pull/66) and [PR #75](https://github.com/dn-lx/me-plus/pull/75) | History-aware planning and tracing/model changes require reconciliation; do not stack them blindly |
| Prior routing work | [PR #67](https://github.com/dn-lx/me-plus/pull/67) is merged | The requirements file's unchecked merge criterion is stale; end-to-end latency acceptance remains separate |
| Supabase metadata | Verified the named Me+ project in `eu-central-1`, PostgreSQL 17; 108 public/private tables and 258 migration ledger entries | Metadata inventory only. No personal record contents were retrieved; RLS-enabled metadata does not prove policy correctness |
| Deployed functions | Read-only function inventory in this session | Versions and bundle hashes identify deployments; full source-to-bundle equivalence was not re-established |
| Canonical design | Current [2.0 architecture](https://docs.google.com/document/d/1xFfA7FYOQSabTc3P4uD2aSlSRp-7DmIsvavrurUwDqs/edit), [roadmap](https://docs.google.com/document/d/1adDUq975YsESauV3Gu55uNnqdU2sFi8WFB3010WQHXE/edit), blueprint and product vision | Preserve central state, cross-device continuity, cost limits and selective adoption; historical appendices need explicit supersession |

No new live sync, signed-in browser session, phone run, backup restore, bank consent, model evaluation or Netlify deployment verification was performed. Current provider availability and cost must be checked again before implementation or procurement.

## Findings and repair paths

Priorities describe delivery risk. A gap is not a claim that an exploit or outage occurred.

| ID / priority | Finding and evidence | Planned repair and acceptance |
| --- | --- | --- |
| A01 / P0 | **Deployed-source provenance is incomplete.** The prepared manifest still labels gateway v15, reasoning v28 and MCP v1; metadata now shows v26, v41 and v2. Other entries also differ; energy-report exists live but has no corresponding function directory in this source set. | ME2-BASE-008: capture version, bundle/source digest, auth mode, owner, intended lifecycle and deployment SHA per function. Reconcile differences before redeploying, deleting or using an old implementation as a fallback. |
| A02 / P0 | **Migration and development-environment recovery is not fully reproducible.** The live ledger includes earlier systems and additive changes; root `supabase/config.toml` is absent. Historical source must not be replayed on the shared project merely to align filenames. | ME2-BASE-008: establish a reviewed schema/config baseline, synthetic seeds and isolated replay/drift checks. Preserve migration provenance and previously applied version mappings. Demonstrate a clean test environment without importing personal data. |
| A03 / P0 | **Preview and production share the canonical database.** Project Memory and both handoffs confirm this. A preview branch is not a data isolation boundary. | ME2-SEC-010: synthetic local/disposable integration environment, separate secrets and explicit shared-runtime deployment gate. Prove cross-owner denial and prevent preview jobs from using live write credentials. |
| A04 / P0 | **Android build and publication responsibilities are mixed.** `.github/workflows/android-local-build.yml` runs lockfile refresh, commits and pushes source, and later commits/pushes APK assets. Hosted runtime CI installs with `--no-frozen-lockfile`. | ME2-DELIVERY-013: immutable input SHA and frozen preflight; designated Windows runner builds and uploads a signed artifact; a separate approved promotion verifies and publishes the same bytes. Branch deletion must not invalidate the artifact. |
| A05 / P0 | **Native health completion is blocked by a real dependency.** PR #38 identifies `20260930073538_health_batch_unique_run_key.sql`; its version is absent from the inspected live ledger. The PR also documents foreground-only behavior and unapplied deletions. | ME2-HEALTH-014: reconcile the exact migration and current atomic-ingest contract, prove rollback/concurrency, then perform a separately authorized rollout and real phone acceptance. Define deletion, cursor-expiry and backfill semantics explicitly. |
| A06 / P0 | **Web session refresh is incomplete in source.** `apps/web/lib/supabase/server.ts` explicitly defers cookie refresh to future middleware/proxy; the login page always returns to Today. Mobile uses SQLite-backed localStorage for auth persistence. | ME2-SEC-010: verify the pinned Next.js/Supabase SSR session boundary, safe local return URLs, sign-out/refresh/recovery and cache isolation. Plan an OS-protected mobile session adapter with tested size/error/logout behavior. |
| A07 / P1 | **Shared types underdescribe the actual backend.** `packages/contracts/src/index.ts` has starter action/observation types and `BankInstitution = "n26"`; native routine, workspace, feedback and scoped-client contracts are implemented elsewhere. | ME2-CONTRACT-009: inventory canonical DTOs and lifecycle states, generate database types, version public contracts and validate external payloads at runtime. Avoid forcing all database domain values into the four presentation categories. |
| A08 / P1 | **Transport boundaries obscure reusable server logic.** Netlify N26 functions import `apps/web/lib/finance` and the web admin client. The 928-line prepared ingestion module mixes source lifecycle, provider reads, normalization and persistence. | ME2-CONTRACT-009 / ME2-BANK-012: extract a server-only application/provider module after contract tests; web and Netlify become wrappers. Preserve Node/Deno boundaries and keep privileged modules out of client dependency graphs. |
| A09 / P1 | **The N26 implementation cannot accept ING by configuration alone.** Authorization fixes bank name/country and 179-day validity; ingestion rejects sessions other than N26 DE; routes, result types and worker selection are institution-specific. | ME2-BANK-012: discover and allowlist bank capabilities; bind connection and consent to exact provider/institution/country/customer type. Select actual bank-supported validity and implement separate ING fixtures. |
| A10 / P0 before dual-bank activation | **Connection controls assume one source per provider.** PR #77 integration controls key runtime by provider and require exactly one source for that provider/owner. Both banks would share `enable-banking`. | ME2-BANK-012: introduce connection/source-scoped control identities, independent proof/sync/clock state and locks, while retaining explicit shared-credential ownership limits. Pausing or reconnecting one bank must not affect the other. |
| A11 / P0 before banking release | **Bank completion needs a durable handoff.** Callback uses Next.js `after()` for initial sync. Subsequent ingestion applies many statements and marks success after pagination. This is not evidence of restart-safe progress. | ME2-JOBS-011: durably store callback/session result plus enqueue receipt before returning; network fetch outside transactions; atomic bounded page apply/checkpoint; leases, bounded retries, dead-letter inspection and replay tests. |
| A12 / P1 | **Financial normalization needs a multi-bank accuracy contract.** The current module converts provider decimal strings with `Number`, selects balance-type fallbacks, and has no proven N26-to-ING transfer reconciliation. | ME2-BANK-012: decimal-safe serialization, explicit balance meaning/as-of, pending/booked/reversal lifecycle, stable account aliases, currency separation and user-reviewable transfer/category suggestions. No inferred precision or automatic ambiguous merges. |
| A13 / P1 | **The clients are behind the prepared owner APIs.** Today performs separate direct table reads; recommendation rating inserts directly into feedback rather than using PR #77's request-safe feedback RPC. Native task/routine settings and integration controls lack a complete client flow. | ME2-CLIENT-015: one user-session capability facade, canonical state/version readback and consistent mutations across web/native. Prioritize Today/Now, task/routine controls, feedback, check-in and connection status. |
| A14 / P1 | **Offline and cross-device behavior needs a defined protocol.** Persistent health cursors do not establish general app conflict resolution or offline mutation safety. | ME2-CLIENT-015: cached reads labeled by snapshot time; limited outbox with stable request IDs; expected-version conflicts; account-scoped caches; no offline external effects. Prove restart, duplicate and two-device behavior. |
| A15 / P1 | **Notification delivery is a separate missing acceptance surface.** A scheduled task or successful source sync does not establish useful, deduplicated delivery. | ME2-NOTIFY-017: attention policy, quiet hours, recipient/device consent, deduplication, expiry and delivery acknowledgement. Notifications contain minimal sensitive content and remain independent of task truth. |
| A16 / P1 | **Recovery and deletion are not yet operationally proven.** The architecture specifies Letta backups and trace deletion gates; an executed restore drill for the whole core is not evidenced here. | ME2-OPS-016: define core/storage/config/secret-reference backup scope, proposed RPO/RTO, isolated restore/export/deletion drills and owner runbooks. Audit records must not retain raw personal text indefinitely by default. |
| A17 / P1 | **Optional runtime preparation is being confused with complete adoption.** PR #77 prepares a stateless tasks-read Letta bridge, inactive n8n import and disabled metadata exporter. It does not deliver persistent reasoning or real client acceptance. PR #75 also changes unrelated model/routing policy. | ME2-EVAL-018 / ME2-AGENT-019: establish held-out scenarios, incomplete-output handling, fixed budgets, revocation, restore/fallback and privacy evidence; promote one route only after a measured result. Separate instrumentation from model changes. |
| A18 / P2 | **Large entrypoints complicate change review.** Prepared gateway/reasoning/Todoist files are approximately 970/1,374/1,389 lines. Size alone is not a defect; mixed routing, auth, model, validation and I/O are a maintenance risk to inspect. | ME2-CONTRACT-009: extract by capability while preserving deployment wrappers and behavioral tests. Retired Todoist code requires call-graph/runtime evidence before removal; do not reinstate it from old specs. |
| A19 / P1 | **Roadmap and product documentation contain stale/placeholder work.** README/architecture claim frameworks are undecided despite Next.js/Expo manifests; requirements include starter placeholders; current-source and current-live status are conflated. | This documentation pass removes product backlog placeholders, labels verified/prepared/planned states and introduces one ordered roadmap. Subsequent implementation must preserve this distinction. |
| A20 / P2 | **Product-domain depth is uneven.** Schema supports health, nutrition, workouts, skills/language and other life records; current client routes mostly cover Today/Review, N26 and health diagnostics. Schema presence is not an accepted user experience. | ME2-DOMAIN-020: build small vertical slices for goals/check-ins, learning/practice, workouts, nutrition/hydration and evidence-based reviews. Inventory existing canonical records first; no parallel tables or blanket dashboard build. |
| A21 / P2 optional | **Slack has no selected app-level use case.** ChatGPT's Slack connector is available; the earlier public search returned no project messages. That credential is not a Me+ backend credential. | ME2-SLACK-021: use Slack only as optional collaboration linking to canonical plans. Inbound task capture or outbound product alerts require a separately selected scope, workspace/user mapping, verification and anti-replay/injection checks. No messages were sent. |

## Runtime inventory discrepancies to reconcile

| Function | Prepared manifest version | Metadata version observed | Action |
| --- | --- | --- | --- |
| Gateway | 15 | 26 | Recover and verify exact source/auth configuration before change |
| Reasoning worker | 28 | 41 | Identify the actual baseline before evaluation or fallback wiring |
| MCP | 1 | 2 | Reconcile deployed grant-metadata response and bundle |
| Todoist dispatcher | 25 | 30 | Determine intended retired/inert behavior; preserve the native-only reset |
| Routing test | 2 | 3 | Classify test endpoint and access before retirement |
| Health Sync / Calendar | 28 / 19 | 28 / 19 | Version agreement; this audit did not prove all source/runtime/config equivalence |
| Energy report | No manifest entry in inspected source | 2 | Recover owner/source/retirement disposition |

`ACTIVE` from the function inventory means deployed status. It does not establish that a scheduler invokes it or that it is authorized to ingest data.

## Technology and plugin decisions

| Option | Recommendation | Admission evidence |
| --- | --- | --- |
| Next.js, Expo/React Native, Supabase, Netlify, pnpm, GitHub Actions | Retain | Existing working contracts and native capability fit; fix delivery and ownership first |
| Supabase-generated TypeScript types plus runtime schemas | Add in the contract work | Exact schema baseline and reproducible generation; select one validator only if existing schema checks cannot be reused |
| Playwright browser acceptance | Add/standardize in client delivery | Isolated two-owner workflows, responsive states, auth refresh and negative paths; compile-only checks are insufficient |
| Expo SecureStore | Evaluate for mobile credential storage | Pin an Expo-compatible version; handle large sessions, native errors, backup/restore and logout. OS-protected storage is not a substitute for server authorization |
| Existing scheduler/dispatch tables with an outbox/lease contract | First durability option | Prove crash/retry semantics before adding another queue |
| Supabase Queues | Conditional second option | Adopt only if existing dispatch cannot satisfy bounded durable jobs; app writes still need idempotency |
| Enable Banking | First AIS provider candidate for N26 + ING | Verify actual application entitlements, exact German retail institutions, accounts, consent limits, terms and current total cost |
| Letta / n8n / Langfuse | Optional, staged | Keep existing prepared adapters; no mandatory host before evidence of benefit and recovery/privacy readiness |
| Temporal, Kafka, Kubernetes, another database/vector store, another agent orchestrator | Defer | No measured requirement currently justifies their extra operations |
| Additional ChatGPT plugins | None required by this audit | Existing GitHub, Drive, Supabase and optional Slack cover planning. Banking plugin discovery returned no verified relevant N26/ING connector; runtime AIS still needs its own integration |

## Decisions still open

1. Confirm ING country and account product before implementation. **ING Germany personal retail** is the planning assumption, not a claim about the user's accounts. Giro, savings, cards and securities have different access coverage.
2. Confirm a separate budget for bank-provider access if current own-account terms do not cover both banks. The existing suggested EUR 20 normal incremental platform/model ceiling is retained as a target; no new spending approved.
3. Approve final core RPO/RTO and retention values against the actual project plan and acceptable data loss; see roadmap proposals.
4. Decide whether ChatGPT needs a hosted OAuth Me+ connection. Existing opaque MCP tokens are sufficient for a manually configured client; OAuth compatibility remains additional scope.
5. Select any Slack product use case before an adapter is designed. Collaboration alone needs no new canonical data store.

## External references checked

- [Enable Banking API reference](https://enablebanking.com/docs/api/reference/): ASPSP discovery, session authorization and `maximum_consent_validity`.
- [Enable Banking October 2024 changelog](https://enablebanking.com/blog/2024/11/06/changelog-october-2024): historical N26 DE and ING DE integration evidence; not proof of today's account coverage.
- [Enable Banking April 2026 changelog](https://enablebanking.com/blog/2026/05/14/enable-banking-changelog-april-2026): institution/country listing changes reinforce runtime discovery.
- [N26 TPP requirements](https://support.n26.com/en-eu/security/open-banking-psd2/psd2-open-banking-for-third-party-providers): direct TPP access has licensing/certificate requirements.
- [ING PSD2 guidance](https://www.ing.de/hilfe/psd2/): regulated TPP access and customer consent.
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Queues](https://supabase.com/docs/guides/queues), [backups](https://supabase.com/docs/guides/platform/backups).
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): secure local storage and payload/platform limits.

The Supabase changelog Markdown endpoint could not be retrieved in this session. No upgrade is proposed; recheck relevant release notes before implementation.
