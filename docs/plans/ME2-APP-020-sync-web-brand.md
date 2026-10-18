# ME2-APP-020 — Health upload recovery and branded v2 web

User reports HTTP500 on phone health upload and requests Me+2.0 web design and Companion logo. Live19:36UTC logs show source_sync_already_completed. Readback confirms the reviewed health_batch_unique_run_key trigger is absent; fresh apply_migration fails Invalid or expired requestState. Narrow repair remains authorized, not live. Preserve existing data and cursor checkpoints.

Plan: independently review and strengthen run-key regression; apply approved trigger when connector works and verify catalog; recover stale running app status; align web with retained v2 light design and Companion assets; run UI/accessibility and workspace gates; publish dev only. Current signed APK0.4.1/code7 already includes Companion launcher. Native changes need a new versioned APK, never relabel old bytes.

Design source: retained14Oct v2 prototype and native tokens. No new database privileges, data deletion, live synthetic records or production app deployment. GitHub operations exclusively through MCP. Supabase is shared; narrow existing repair has owner authorization from previous task.
