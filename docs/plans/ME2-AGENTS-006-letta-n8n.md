# ME2-AGENTS-006 — Letta and n8n setup before authorization

User explicitly requested Letta/n8n integration work before authentication (16 October 2026). Continue the verified backend branch; Supabase PR waiver still applies. No provider login, paid host, bank setup or app/website publication.

Current evidence: deployed Me+ JSON Streamable HTTP MCP supports scoped opaque bearer access; no Letta/n8n runtime/account configured. Google connector controls/workers already deployed but authorization deferred. N26 explicitly deferred. Canonical state remains Supabase; optional agents cannot become a required scheduler or database.

Deliver: credential-free Letta registration/attachment configuration, inactive manual n8n workspace workflow, explicit activation tooling for an existing approved runtime, a bounded MCP client, negative/privacy/retry tests against the actual Me+ handler, and recovery/runbook. Default tasks-only read access; mutation tools require a separately reviewed use case and new grant. Dedicated health/guidance sections are excluded; user-approved task text may itself contain personal/health/finance details. Do not mint tokens before the user is ready to authenticate.

Sequence: verify current official provider APIs → templates and fail-closed setup CLI → synthetic protocol/provider contract tests → independent security review → hosted CI and durable handoff. No database migration needed. Add authenticated token scope metadata to MCP tools/list so setup can prove exact tasks-only grants. Deploy this additive MCP response before using activation tooling. API/tool/schema compatibility is verified against official docs/source; actual hosted Letta/n8n import/execution remains unverified without their accounts. Do not call that connected.

Security: credentials only in process environment and provider credential stores; no response bodies/keys in logs or generated JSON; no redirects/retries of setup writes; timeouts and response bounds. Workflow execution persistence off, no public webhook/schedule/AI node. Partial registration may leave a known server record; rerun checks unique name/URL and reuses it, never silently replaces credentials; masked/unknown/mismatched stored auth requires manual review and fails closed.

Rollback: deactivate/delete the imported inactive workflow; detach the Me+ tool and remove its server registration; revoke the owner-scoped token in Me+. Supabase native scheduling continues unchanged. Letta memory backup/restore and selective benefit/privacy acceptance remain prerequisites before persistent production reasoning. No model changes or memory migration included.

Status: implementation and independent security review complete; local Node suite 125 passed / 7 pre-existing skipped. Reviewer independently ran all 23 focused tests. Hosted CI/container import and additive MCP scope metadata deployment pending. Source tests are not hosted provider acceptance.

Provider provisioning discovery: Stripe CLI is unavailable in this environment; Directory setup page could not be retrieved through the public lookup. No account provisioning was attempted. Implementation uses the requested vendors’ official APIs and remains credential-free until the later authentication phase.
