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

## 0001__sweep_log (Movement 4 sweeper)

- File: `packages/grey-sweeper/migrations/0001__sweep_log.sql`
- sha256: `bf59744ec92794b90ce6fcc4c4e03d84be579785e98fcacb04794ab7f2019a5c`
- Applied at: ~2026-07-07T03:28Z (UTC)
- Applied by: Kov (Claude Code CLI) via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f packages/grey-sweeper/migrations/0001__sweep_log.sql` (Forces-authorized at M4 Phase-B directive §4.1 Option A, 2026-07-06)
- Purpose: audit trail for sweeper activity; required by Phase B exit criterion §6.9 (`grey_two.sweep_log` row written for the smoke sweep).
- Tables created: `grey_two.sweep_log` (1) — 10 columns (`id BIGSERIAL PK, swept_at TIMESTAMPTZ, tx_hash, amount_wei NUMERIC(78,0), source, destination, status CHECK ok/failed/skipped, error_class, error_msg, chain_id INTEGER`). Additive; zero contact with any existing `grey_two` table or any `wpv_*`/`autognostic` table.
- Indices: `sweep_log_pkey` + `idx_sweep_log_swept_at` (2, verified).
- Grants: `grey_pipeline_rw` → USAGE on schema `grey_two`, INSERT+SELECT on `sweep_log`, USAGE+SELECT on `sweep_log_id_seq`; REVOKE UPDATE/DELETE/TRUNCATE on `sweep_log` (append-only for the runtime role, verified INSERT+SELECT present).
- `supabase_migrations.schema_migrations` on remote: **untouched** (5 rows, all plugin-wpv/autognostic: `20260601161838` … `20260613022829`; no grey row added — psql apply, not CLI push).
- Anomalies: none. Preflight verified `grey_two` schema + `grey_pipeline_rw` role present and `sweep_log` absent before apply; all 6 DDL statements (CREATE TABLE, CREATE INDEX, 3× GRANT, REVOKE) returned success under `--single-transaction`.
