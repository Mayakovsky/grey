# applied_migrations.md

Canonical tracking for grey's migrations. The `supabase_migrations.schema_migrations`
table in the linked Supabase project (`ymuyfxztfpdldqtbkoic`) is **shared** with
plugin-wpv (the `autognostic` schema) and is **NOT grey's to write**. Grey's migration
history lives here.

Apply mechanism: `psql --single-transaction -v ON_ERROR_STOP=1 -f <migration-file>`
against `WPV_DATABASE_URL` (env-indirected from `plugin-wpv/.env`, never echoed).
This is grey's canonical pattern from Step 2 forward (Movement 4 `sweep_log`, CI, VPS).

## 20260610001048_create_grey_two_schema

- File: `supabase/migrations/20260610001048_create_grey_two_schema.sql`
- sha256: `E8C9D7D3CB927081A6A34F026B62419355F903F822502BDC34C263221CB7B5D9`
- Applied at: ~2026-06-10T01:09Z (UTC)
- Applied by: Kov (Claude Code CLI) via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f ...` (Forces-authorized at Gate #2, 2026-06-09, psql-supersede packet)
- Mechanism rationale: Supabase CLI `db push` refused due to the shared `schema_migrations` with plugin-wpv (its `20260601161838` row). psql apply with this manual ledger preserves plugin-wpv's tracking row and gives grey its own canonical history.
- Tables created: `grey_two.{whitepapers, requests, verifications, claims, cost_events}` (5)
- Indices: 12 named + 5 primary-key = 17 total (verified)
- Foreign keys: all `grey_two`-internal (no cross-schema); `whitepaper_id` → CASCADE, `request_id`/`verification_id` → SET NULL (verified)
- Cost columns: `numeric(12,6)` — `cost_events.cost_usd`, `verifications.{compute_cost_usd,l2_cost_usd,l3_cost_usd}` (verified)
- `supabase_migrations.schema_migrations` on remote: **untouched**. `20260601161838` (`movement_1_buyer_reputation_gating`, plugin-wpv / Movement 0 Extension) still present; no `20260610001048` row added (correct — psql apply, not CLI push).
- Anomalies: none. (One operator note: the first apply attempt used a bare connection-string positional, which made psql 16 stop option-parsing and ignore `-f` → it hung on stdin and was killed; nothing was applied. Re-run with `-d <url>` + `-w` succeeded cleanly. No partial state at any point — verified empty before the successful apply.)
