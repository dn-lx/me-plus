# ME2-AGENTS-006 — Letta and n8n setup before authorization

User explicitly requested Letta/n8n integration work before authentication (16 October 2026). Continue the verified backend branch; Supabase PR waiver still applies. No provider login, paid host, bank setup or app/website publication.

Current evidence: deployed Me+ JSON Streamable HTTP MCP supports scoped opaque bearer access; no Letta/n8n runtime/account configured. Google connector controls/workers already deployed but authorization deferred. N26 explicitly deferred. Canonical state remains Supabase; optional agents cannot become a required scheduler or database.

Deliver: credential-free Letta local App Server adapter, inactive manual n8n workspace workflow, explicit session/import tooling for an existing approved runtime, a bounded MCP client, negative/privacy/retry tests against the actual Me+ handler, and recovery/runbook. Default tasks-only read access; mutation tools require a separately reviewed use case and new grant. Dedicated health/guidance sections are excluded; user-approved task text may itself contain personal/health/finance details. Do not mint tokens before the user is ready to authenticate.

Sequence: verify current official provider APIs → templates and fail-closed setup CLI → synthetic protocol/provider contract tests → independent security review → hosted CI and durable handoff. No database migration needed. Add authenticated token scope metadata to MCP tools/list so setup can prove exact tasks-only grants. Deploy this additive MCP response before using activation tooling. API/tool/schema compatibility is verified against official docs/source; actual hosted Letta/n8n import/execution remains unverified without their accounts. Do not call that connected.

Security: credentials only in process environment and provider credential stores; no response bodies/keys in logs or generated JSON; no redirects/retries of setup writes; timeouts and response bounds. Workflow execution persistence off, no public webhook/schedule/AI node. Letta session tools are connection-scoped and tokens stay in the bridge closure, eliminating persisted registration reuse. n8n partial import requires name-based inspection; no overwrite or automatic write retry.

Rollback: deactivate/delete the imported inactive workflow; close the Me+ Letta session; revoke the owner-scoped token in Me+. Supabase native scheduling continues unchanged. Letta memory backup/restore and selective benefit/privacy acceptance remain prerequisites before persistent production reasoning. No model changes or memory migration included.

Status: implementation and independent security review complete; local Node suite 125 passed / 7 pre-existing skipped. Reviewer independently ran all 23 focused tests. Hosted CI/container import and additive MCP scope metadata deployment pending. Source tests are not hosted provider acceptance.

Provider provisioning discovery: Stripe CLI is unavailable in this environment; Directory setup page could not be retrieved through the public lookup. No account provisioning was attempted. Implementation uses the requested vendors’ official APIs and remains credential-free until the later authentication phase.

Canonical/current API reconciliation: the accepted plan specifies local/private Letta state. Current docs mark the V1 REST surface legacy; the initially prepared Cloud registration helper was replaced with pinned V2 Agent SDK 0.8.45 local App Server sessions before activation. No Cloud account is needed. Model selection remains supplied by approved Me+ policy; no inference is performed. Real SDK/local runtime CI uses synthetic state and an exact task-tool/model manifest check; no production agent, memory migration, model promotion, or paid host is created.
