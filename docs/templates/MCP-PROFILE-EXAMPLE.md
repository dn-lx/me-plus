# Example MCP Profile

This is an example only. Copy the relevant rows into `docs/MCP-SETUP.md` and replace them with real project facts.

| Capability | Status | Provider | Environment | Safe verification |
| --- | --- | --- | --- | --- |
| Source/PRs | Required | GitHub | owner/repo | Read current branch / open PRs |
| Current docs | Optional | Context7 | Agent host | Resolve/query a public library |
| Database | Required | Supabase | project ref (non-secret) | List/read schema metadata |
| Hosting | Required | Netlify | site name/id (non-secret) | Read current deploy |
| Browser verification | Optional | Playwright | Local/preview | Open read-only page |
| Code relationships | Optional | Graphify | Local | Query known symbol |

Status values are `Required`, `Optional`, or `Not used`. Never put access tokens, service-role keys or passwords in this table.
