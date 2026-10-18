# Me+ Supabase

Supabase is the canonical structured-data backend for Me+.

## Ownership

- `migrations/` — schema evolution and database policy changes.
- `functions/` — narrowly scoped server-side functions only where justified.
- Auth, Storage and Realtime configuration belong here or in documented deployment configuration as appropriate.

## Security

- Exposed user tables require explicit ownership and RLS.
- Privileged credentials never ship to web or mobile clients.
- Device/sensor ingestion must preserve provenance and distinguish raw observations from derived insights.
- External writes must be auditable and constrained by Me+ domain policies.

The concrete development project/environment is selected and verified before any live schema or data write.

## Migration provenance

Historical Me+ migrations reconstructed from the live migration ledger are committed under `migrations/`. See `MIGRATION-PROVENANCE.md` for reconstruction rules and the handling of one-off production-state repairs.
