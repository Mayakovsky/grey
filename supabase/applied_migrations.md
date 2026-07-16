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

## 20260715120000_create_refuel_log  (+ 20260716090000 append-only corrective)

Movement 5 Phase F — the relayer gas-refuel audit table. Create and its FDQ-52
append-only corrective are recorded together: they form one logical unit (the
corrective closes an over-broad grant surface the create left open). Both applied
Forces-lane (psql + `WPV_DATABASE_URL`); Kov-verified.

### Create — `20260715120000_create_refuel_log`

- File: `supabase/migrations/20260715120000_create_refuel_log.sql`
- sha256: `344c34fc5b0ac00f22595c60d90741b55f316c963f1fa1e580b5fc7f5b5c1bed`
- Applied at: ~2026-07-15 (Phase F F3 create step)
- Applied by: Forces (Forces-lane) via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260715120000_create_refuel_log.sql` (Phase F §5 gate; PR #19). Kov-verified.
- Tables created: `grey_two.refuel_log` (1) — 15 columns (`id BIGINT GENERATED ALWAYS AS IDENTITY PK`, `ticked_at TIMESTAMPTZ DEFAULT now()`, `chain_id INT NOT NULL`, `relayer_balance_before_wei NUMERIC(38,0) NOT NULL`, `deficit_wei`/`usdc_in`/`quote_out_wei`/`min_out_wei`/`eth_delivered_wei NUMERIC(38,0)`, `swap_tx`/`unwrap_tx`/`transfer_tx`/`error_class`/`error_detail_redacted TEXT`, `status TEXT NOT NULL CHECK ok/skipped/insufficient_usdc/quote_oob/failed`). Additive; zero contact with any existing `grey_two`/`wpv_*`/`autognostic` table.
- Indices: `refuel_log_pkey` + `refuel_log_ticked_at_idx` (ticked_at DESC) + `refuel_log_status_idx` (3, verified).
- Grants (as authored): `INSERT, SELECT` to `grey_pipeline_rw`. **NOTE (FDQ-52):** `grey_two`'s `ALTER DEFAULT PRIVILEGES` leaked `UPDATE`/`DELETE` onto the new table; effective grants were `INSERT+SELECT+UPDATE+DELETE` until the corrective below. Uses IDENTITY (no sequence grant needed).
- `supabase_migrations.schema_migrations` on remote: **untouched** (5 rows, all plugin-wpv/autognostic: `20260601161838` … `20260613022829`; no grey row — psql apply, not CLI push). Verified.

### Corrective — `20260716090000_refuel_log_append_only` (FDQ-52)

- File: `supabase/migrations/20260716090000_refuel_log_append_only.sql`
- sha256: `1241bb7ec20ecad4fdef7153371e0f6fc1d4f3b95117417b6056923785ec9a21`
- Applied at: ~2026-07-16T04:19Z (between PR #20 merge 2026-07-16T04:16:56Z and the grant re-verify)
- Applied by: Forces (Forces-lane) via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260716090000_refuel_log_append_only.sql` (PR #20). Kov-verified.
- Reason (FDQ-52, Desktop authoring defect): the create copied `sweep_log`'s `GRANT` without `sweep_log`'s companion `REVOKE`, so the schema default privileges (`UPDATE`/`DELETE`) stood. Caught by Kov's F3 grant verify (effective grants read `INSERT+SELECT+UPDATE+DELETE`, not the intended append-only pair).
- Statement: `REVOKE UPDATE, DELETE, TRUNCATE ON grey_two.refuel_log FROM grey_pipeline_rw;` + table `COMMENT` update. Idempotent (REVOKE of an absent privilege is a no-op).
- Grants after corrective (**verified**): `grey_pipeline_rw` → `INSERT, SELECT` **only** (UPDATE/DELETE removed; TRUNCATE never present). `postgres` (owner) retains full. Append-only restored — matches the `sweep_log` posture.
- `supabase_migrations.schema_migrations` on remote: **untouched** (no grey row added). Verified.
- Anomalies: FDQ-52 (create's missing REVOKE), remediated same-lane by this corrective. No partial/broken state at any point — the table was fully created and functional throughout; only the grant surface was over-broad between the two applies.
