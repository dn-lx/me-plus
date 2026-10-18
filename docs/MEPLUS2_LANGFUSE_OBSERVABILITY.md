# Me+ 2.0: Langfuse metadata-only observability adapter

The canonical architecture is the Google Drive **Me+ 2.0 — Platform Architecture & Selective Adoption Plan**.
This file records implementation and deployment constraints, not changing personal state.

## Status and activation

The reasoning worker has a **disabled-by-default** OTLP/HTTP exporter.
No Langfuse account, secret, or live connection is implied by merging this code.

Configure the *server-side Supabase Edge Function secrets* only when an approved
Langfuse project is available:

- `MEPLUS_LANGFUSE_ENABLED=true`
- `MEPLUS_LANGFUSE_PRIVACY_APPROVED=true` after explicit privacy approval
- `MEPLUS_LANGFUSE_RETENTION_APPROVED=true` after retention/deletion acceptance
- `MEPLUS_LANGFUSE_APPROVED_MODELS` (comma-separated exact approved API model IDs)
- `LANGFUSE_PUBLIC_KEY` (from Langfuse project settings)
- `LANGFUSE_SECRET_KEY` (from Langfuse project settings)
- `LANGFUSE_HOST=https://cloud.langfuse.com` (EU hosted instance or approved HTTPS self-host)

Never put these values in `NEXT_PUBLIC_*`, frontend code, or GitHub source.
Without the opt-in or either credential, the exporter makes **no network call**.
It must never change scheduling, retries, recommendations, canonical state, or cost routing.

## Protocol

Uses OpenTelemetry JSON to `POST /api/public/otel/v1/traces`, with
`x-langfuse-ingestion-version: 4` and Langfuse Basic authentication.
The deprecated `/api/public/ingestion` endpoint is intentionally not used.

Only an allowlist is exported: reasoning route, approved model, timestamp,
attempt, completion/failure status, token counts and estimated USD cost.
OTLP trace/span IDs are deterministic opaque hashes of dispatch/attempt identifiers.
No raw prompt, model output, user ID, health data, finance data, journal text,
complete Personal State, secret, or freeform exception message is exported.

Raw dispatch IDs are omitted. HTTPS origins reject credentials, paths, query,
fragments and custom ports; redirects are rejected. Responses are bounded to16KiB
and partial span rejection is failure. All activation/privacy/retention gates
remain disabled unless explicitly approved; this source merge activates nothing.

Exports time out after 1.5 seconds and are caught by the worker. An observability
outage cannot turn a successfully processed dispatch into a failed dispatch.

## Verification and rollout

1. Run `pnpm test:integration` and inspect `tests/meplus-langfuse-privacy.test.mjs`.
2. Compare the GitHub worker baseline against the currently deployed source so
   enabling this does not overwrite operational hotfixes or Luna routing.
3. Deploy both `index.ts` and the sibling `langfuse.ts` to the reasoning-worker
   Edge Function, preserving its existing JWT verification setting.
4. Leave the feature flag off until a real Langfuse project and keys exist.
5. In a limited test, enable tracing and verify a trace in Langfuse contains only
   the allowlisted fields. Verify cost, trace count, and no dispatch failures.
6. Roll back immediately by setting `MEPLUS_LANGFUSE_ENABLED=false`.
   Do not disable the reasoning worker itself to disable observability.

The next phase is selective Letta benchmarking, not a universal reasoning cutover.

