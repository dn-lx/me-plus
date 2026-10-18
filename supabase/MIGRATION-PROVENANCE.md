# Supabase Migration Provenance

This repository treats `supabase/migrations/` as the versioned source for Me+ schema evolution.

## Reconstruction rule

The live Me+ project already contains applied migrations that predate the repository migration folder. Historical Me+ migration files are reconstructed from the SQL recorded in `supabase_migrations.schema_migrations` so the repository can reproduce the schema and stay aligned with the remote migration ledger.

Reconstruction is intentionally limited to Me+ migrations beginning with the Me+ data-foundation migration era. Earlier legacy schemas in the same Supabase project are outside this repository's ownership.

## Operational-state exception

Historical migration records sometimes combined a schema change with a one-off production repair or acceptance-test write containing user-specific row IDs. Reconstructed files must preserve the schema change but must not replay user-specific operational state. For those versions, the file contains the reusable schema portion plus a comment documenting that the one-off state repair was intentionally omitted.

A migration that existed only to close a production acceptance run is represented as a no-op historical marker. This preserves version alignment without turning live user state into Git-managed seed data.

## Going forward

- Schema changes are delivered through versioned migration files.
- Dynamic user state is changed through runtime/application workflows, not schema migrations.
- New migration files must be committed before or together with remote application.
- Migration history and repository history should be checked together before schema work.
