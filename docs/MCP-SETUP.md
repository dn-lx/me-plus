# MCP and Connector Setup

External tool access is host-specific. This repository documents **required capabilities and safe usage**, while credentials and private tokens stay outside Git.

MCP means Model Context Protocol, but the same rules apply to equivalent connectors/plugins/apps exposed by an agent host.

## 1. Project MCP profile

When bootstrapping a real project, mark each capability as **Required**, **Optional**, or **Not used** and name the actual provider if known.

| Capability | Status | Typical provider/tool | Project provider | Purpose |
| --- | --- | --- | --- | --- |
| Source control / PRs / CI | Required | GitHub | TODO | Branches, diffs, PRs, checks, workflow logs |
| Current library/API docs | TODO | Context7 / official docs | TODO | Version-aware SDK/API behavior |
| Database/auth/storage | TODO | Supabase / Firebase / vendor tool | TODO | Schema, auth, storage, functions, logs |
| Hosting/deployments | TODO | Netlify / Vercel / Cloudflare | TODO | Preview/deploy state and config |
| Browser/computer verification | TODO | Playwright / browser tooling | TODO | Rendered UI and workflows |
| Code relationships | TODO | Graphify / code graph | TODO | Imports, callers, change impact |
| Runtime observability | TODO | Sentry / vendor equivalent | TODO | Production errors/traces |
| Product analytics/flags | TODO | PostHog / vendor equivalent | TODO | Events, flags, experiments |
| Payments | TODO | Stripe / equivalent | TODO | Test/sandbox payments/config |
| Transactional email | TODO | Resend / equivalent | TODO | Templates, logs, delivery, webhooks |
| Documents/business files | TODO | Google Drive / SharePoint / Dropbox | TODO | Existing project/business artifacts |
| Issue/project management | TODO | GitHub / Linear / Jira | TODO | Planning and issue state |

Only connect capabilities the project actually needs. In the starter, `TODO` means the project has not made the Required / Optional / Not used decision yet; replace every status TODO during bootstrap.

## 2. Capability-first rule

Do not make project instructions depend on a single agent vendor's connector name. Write requirements as capabilities:

> Need read/write access to GitHub pull requests.

not:

> Must use Tool X forever.

A provider/tool may be replaced if it supplies the same capability, permissions and evidence.

## 3. Mandatory verification before use

Repository documentation is **not evidence that a connector is active**.

Before claiming an MCP/connector works:

1. discover/list the connection in the current agent host,
2. perform a harmless read against the intended account/project,
3. verify returned identity/environment,
4. verify permission level is appropriate,
5. only then perform an authorized write.

If verification fails, stop before writing and report the missing connection.

## 4. Security rules

- Never commit API keys, OAuth tokens, refresh tokens, passwords, certificates, service-role keys or private MCP config containing secrets.
- Keep secrets in the agent host's secure connection store, OS keychain, repository/environment secrets, or hosting secret store.
- Prefer least privilege. Investigation should default to read-only where possible.
- Confirm account/project/environment before every sensitive write.
- A development branch does not imply external data is isolated. Treat shared databases, email, payments, analytics and hosting projects as live/shared unless documentation proves otherwise.
- Do not paste secrets into prompts, logs, screenshots, issue bodies or handoff docs.
- Record material external writes in `docs/CURRENT-HANDOFF.md`.
- For auth, data, payments, privileged functions or secret-related changes, use `.agents/skills/security-boundary-review/SKILL.md`.

## 5. Host-specific startup checks

### ChatGPT / OpenAI Codex
- Confirm required connected apps/tools are actually available in the current environment.
- For coding tasks, verify the active GitHub repository/branch before writes.
- Use repository Agent Skills for repeatable specialist workflows.

### Claude Code
- Inspect configured MCP servers before use.
- Keep reusable server definitions credential-free where possible.
- Store credentials in the Claude/OS secure configuration, not Git.

### Gemini CLI
- Use Gemini's MCP list/status command before relying on a server.
- Keep durable decisions in repository docs rather than session memory.

### Cursor / Cline / Roo Code / Windsurf / OpenCode
- Use the host's MCP configuration/status UI or config file to verify the server is connected.
- Do not copy private machine-specific tokens into repository configuration.

### GitHub Copilot
- Treat GitHub-native repository/PR context as a capability, but still verify external systems separately.

## 6. Local code intelligence

Graphify is a local developer/agent tool, not a hosted MCP requirement. Use it to narrow repository context before asking a model to inspect many files.

Generated graphs:
- are disposable,
- must not be committed,
- are not authoritative,
- must be rebuilt after relevant source/revision changes,
- must be verified against current source.

See `.agents/skills/graphify/SKILL.md`.

## 7. Adding a new MCP/connector

Before adding a new integration, document:

1. capability it provides,
2. why existing capabilities are insufficient,
3. read/write scope required,
4. environments/accounts it may touch,
5. where credentials are stored,
6. harmless verification action,
7. sensitive/destructive actions that require explicit review,
8. expected failure mode if unavailable.

Then update the Project MCP profile above.

## 8. MCP effectiveness

A large MCP list is not automatically better.

Prefer a small set of well-understood capabilities. Remove or disable integrations that:
- duplicate an existing capability without benefit,
- broaden permissions unnecessarily,
- add large repetitive context,
- are rarely used,
- cannot be reliably verified.

Measure usefulness by reduced manual work, better evidence, fewer errors and lower context/rework—not by connector count.
