# Me+ agent integration packages

Prepared for authorization later. These files do not create a production host, model agent, provider credential or Me+ token. Actual account import, tool execution and persistent-memory acceptance remain pending. Supabase remains canonical and the native clock works without these platforms.

## Status and access

| Integration | Prepared now | Still required |
| --- | --- | --- |
| Letta | Local App Server session adapter; strict tasks-only client tool; exact grant preflight; pinned SDK/runtime smoke | Approved local/private runtime and existing agent; owner-issued tasks-only token; approved model and provider key for later inference; backup/restore and benefit acceptance |
| n8n | Importable manual tasks workflow; credential binding/import CLI; privacy settings; synthetic protocol validation | Approved account/runtime; stored header credential; API key if using CLI; real manual execution and permission denial acceptance |
| Google Calendar / Health Sync | Existing deployed workers and owner activation controls | Renewed authorization and successful fresh-only sync before recurring clocks |
| N26 | Prior guarded artifact | Explicitly deferred by user, including deployment and bank consent |
| Langfuse | Disabled metadata-only OTLP v4 exporter, strict event allowlist, partial/error handling and synthetic privacy tests | Approved project/region/keys; retention/deletion evidence; hosted canary/dedup/deletion verification before wiring or export |

The default profile is `operations=['read_state']`, `data_scopes=['tasks']`. No service-role key belongs in either platform. Dedicated health/guidance sections are excluded, but **task text itself can contain sensitive personal/health/finance information**; approve the destination runtime before using real data. n8n fetches at most 10 tasks and outputs only a count. Its HTTP node still sees task text in memory/the manual editor. Execution persistence settings do not guarantee deletion from infrastructure logs, administrator access, backups or a platform's own telemetry.

## Offline preparation (no credentials or network)

From repository root, Node22+:

```sh
node integrations/agent-clients/setup.mjs
node integrations/agent-clients/setup.mjs letta
node integrations/agent-clients/setup.mjs n8n
```

Output contains required environment **names**, endpoint and non-connected status only. Templates contain no secret placeholders that might accidentally be deployed as credentials. Letta sessions receive an application client tool whose credential remains in the bridge closure; no token is stored on an agent or in a server registration.

## Later secure activation

1. Choose the approved self-hosted runtime, region and retention policy. No paid host is provisioned automatically. Letta uses the current Agent SDK **local backend** (state/runtime on the same machine as the bridge), matching the canonical plan; no Letta Cloud account is required. The SDK manages a private local App Server subprocess. Use a dedicated OS/container identity and an empty isolated working directory, not a personal home or repository. Do not expose this local server publicly. n8n Community uses an explicitly configured HTTPS origin with no path, port or query.
2. Sign in to Me+ later and issue **separate** short-lived `letta` and `n8n` client tokens through `create_meplus_client_token`, limited to `read_state` and `tasks`. Store each token securely. Never paste it in chat/Git/observability. Renew/revoke with the existing owner APIs. MCP grant metadata preflight requires the additive tools/list scope response; older servers fail closed.
3. Install the pinned Letta runtime with `npx --yes pnpm@11.25.0 --dir tooling/letta-runtime install --frozen-lockfile --ignore-scripts --config.manage-package-manager-versions=false`. Supply `MEPLUS_CLIENT_TOKEN`, `LETTA_AGENT_ID`, `LETTA_WORKDIR` (absolute empty isolated directory), and `LETTA_APPROVED_MODEL` securely. The existing agent (no base tools, dreaming disabled) and exact model must come from the approved Me+ runtime/model policy; this CLI does not choose/promote a model or run inference. Run `node integrations/agent-clients/setup.mjs letta --apply` to open a local session, verify its identity, approved model and empty stored base-tool manifest, and close it. It does not create a production agent. Reusable `letta/session.mjs` exposes only `meplus_read_tasks`, strict approvals, no skills and stateless MemFS; the approved existing agent must have dreaming disabled. The tool enforces tasks-only input independently of SDK validation. All shell/filesystem/memory-writing tools are excluded. Stateless MemFS does not mean conversation history is erased: apply the approved runtime deletion/backup policy. The Me+ MCP token stays in the bridge closure, not a persisted Letta MCP registration. All nonessential ambient environment variables are blanked for the SDK child (including database URLs and model-provider credentials); this preparation package does not run inference. Later inference needs separately approved, narrowly supplied provider credentials and budget enforcement. Session tools are scoped to each connection, so no old registered token is reused. Stop/delete an older deployment's unknown credential registration before using it.
4. For n8n, import `n8n/tasks-readonly.json` in the editor and attach a Header Auth credential (`Authorization`, value `Bearer <owner-issued n8n token>`) to **Read Me+ tasks**. Keep all execution data settings off. Alternatively securely supply `N8N_API_ORIGIN`, `N8N_API_KEY`, `N8N_MEPLUS_CREDENTIAL_ID` and run `node integrations/agent-clients/setup.mjs n8n --apply`. This binds the **existing** credential ID without reading or transmitting its secret; creation stays unpublished/inactive. It does not validate what token that credential holds. Verify it is the separately issued tasks-only token in the secure credential editor before execution. Duplicate workflow names cause a review-required stop rather than overwrite. Run setup from one operator/process at a time; remote create APIs do not provide an atomic name reservation.
5. Run the n8n workflow manually. The validator must return `ok=true` with a task count and fail on JSON-RPC or tool errors. Check HTTP credential scope independently using the same token and `node integrations/agent-clients/setup.mjs verify --apply` in a secure environment. Verify the local SDK model/tool manifest without inference first, then permission denial/revocation on each runtime. A successful session or import is not production reasoning acceptance. Do not enable a background agent or duplicate daily task clock.
6. Test one synthetic task, token revocation and recovery. Letta persistent memory stays behind selective-adoption/backup/restore/fallback/privacy gates; do not move canonical records into it. No automatic health/finance mutations, notifications, bank operations or arbitrary SQL are exposed.

The setup client refuses redirects, bounds responses to 256KiB, times out after 15s, never retries writes, and emits sanitized status/errors. If a write times out it may already exist; inspect the named server/workflow before retry. Provider response bodies may contain keys and are never logged by this tooling. Remote response data used for matching exists only in process memory.

## Disable and recover

Keep n8n unpublished/inactive; close the Letta session; revoke the corresponding Me+ token. Remove the workflow and any historical server registration when desired. Stop/delete remote runs and remove task-derived memory according to the approved provider retention policy; revoking a token does not delete provider memory/backups. Restore the approved Letta backup and prove fallback to native Me+ before persistent use. No database rollback, canonical-state deletion or provider-clock change is needed.

## Reproducible verification

```sh
node --experimental-strip-types --test tests/agent-integrations.test.mjs tests/meplus-mcp.test.mjs
```

Tests use the actual Me+ MCP handler with synthetic task state and provider API fixtures. Hosted backend-readiness CI also imports the exported workflow into an ephemeral **n8n 2.43.7 container with networking disabled**, without credentials or a saved volume. This checks real runtime import compatibility; it is not authenticated hosted execution. A separate CI job installs pinned Letta Agent SDK 0.8.45 and starts its actual local App Server with a synthetic agent, no provider keys and no inference; it verifies the approved model and empty stored base-tool manifest; session client-tool permissions are checked independently. This does not prove long-running production recovery or model quality.

Official contract references checked 16 October 2026:

- [Letta local deployment](https://docs.letta.com/agent-sdk/deployment), [session client tools](https://docs.letta.com/agent-sdk/mcp), [strict permissions](https://docs.letta.com/agent-sdk/permissions), [SDK reference](https://docs.letta.com/agent-sdk/reference).
- [n8n HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest), [workflow API](https://docs.n8n.io/connect/n8n-api/workflow.md), [execution persistence settings](https://docs.n8n.io/build/manage-workflows/configure-workflow-settings.md), [pinned runtime release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.43.7).

Runtime dependency audit: upstream Letta Code npm shrinkwrap pins vulnerable transitive versions, so this isolated workspace uses pnpm11.25.0 with explicit MCP SDK1.32.1 and sharp0.35.5 overrides. The pinned local SDK/App Server smoke must pass with these patches. No global dependency upgrade or advisory suppression is used.

## Langfuse preparation

`langfuse/export.mjs` exports `buildMetadataTrace(event, approvedModels)` and nonthrowing `exportMetadataTrace(event, config, fetchImpl)`. This standalone Node server module is not wired into or deployed with the live reasoning worker. Default `enabled` is false; explicit `privacyApproved` and `retentionApproved` must both be true before any request. Config also requires an approved HTTPS `origin`, project `publicKey`/`secretKey`, and trusted-runtime `approvedModels`. Store keys in server secrets only. Do not turn these gates on before the documented privacy review and real synthetic project canary.

Supported route categories are native_worker/letta_shadow/letta_review/synthetic_canary. Event fields: canonical dispatch UUID, attempt, ISO start/end timestamps, approved model ID, completed/failed status, finite token counts and estimated USD cost. All additional fields are discarded; freeform route/model names are rejected. Dispatch UUID is hashed rather than exported raw. Source/model-specific pricing is supplied by existing approved Me+ policy, not calculated here. Event content never includes prompts, responses, user IDs, Personal State, journal/health/finance payloads or exception text.

Uses `POST /api/public/otel/v1/traces` with OTLP JSON and v4 ingestion header. It does not use the legacy ingestion endpoint scheduled for sunset. Requests time out after 1.5s, cannot redirect or retry automatically, and reject oversized/partial/error acknowledgements. Failure returns a sanitized result; keep it outside canonical dispatch transactions. Stable trace/span IDs support correlation/retry identity; **actual hosted deduplication, ingestion, deletion and retention are not proved by these tests**. Validate them on an approved synthetic project before enabling. Use the existing System Health observer for failures when wired later; do not add a second runtime observer.

Reproduce the six redaction/gate/transport tests with `node --test tests/langfuse-preauth.test.mjs`. Current official references: [OTLP ingestion](https://langfuse.com/docs/observability/get-started), [API compatibility](https://langfuse.com/docs/compatibility), [trace lifecycle](https://langfuse.com/docs/api-and-data-platform/features/public-api). Disable export to stop new ingestion; revoke credentials and separately delete provider data/backups under its approved lifecycle policy. No automatic remote deletion is implemented or claimed.
