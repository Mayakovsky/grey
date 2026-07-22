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

## 20260715120000_create_refuel_log (Movement 5 Phase F)

- File: `supabase/migrations/20260715120000_create_refuel_log.sql`
- sha256: `344c34fc5b0ac00f22595c60d90741b55f316c963f1fa1e580b5fc7f5b5c1bed`
- Applied at: ~2026-07-16 (UTC), exact time not recorded — applied just before the first `grey_two.refuel_log` row (`ticked_at 2026-07-16 23:38:46 UTC`). Ledger back-filled by Kov 2026-07-17.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260715120000_create_refuel_log.sql` (M5 Phase F spec §2; owner/migration cred). The Supabase CLI is NOT used (shared `schema_migrations` with plugin-wpv — M1 lesson).
- Purpose: Phase F relayer-refuel audit table `grey_two.refuel_log` — one row per non-steady-state refuel evaluation (ok/skipped/insufficient_usdc/quote_oob/failed; silent skips not persisted).
- Tables created: `grey_two.refuel_log` (1) — 15 columns (`id BIGINT GENERATED ALWAYS AS IDENTITY PK, ticked_at TIMESTAMPTZ DEFAULT now(), chain_id INTEGER, relayer_balance_before_wei/deficit_wei/usdc_in/quote_out_wei/min_out_wei/eth_delivered_wei NUMERIC(38,0), swap_tx/unwrap_tx/transfer_tx TEXT, status TEXT CHECK(ok/skipped/insufficient_usdc/quote_oob/failed), error_class/error_detail_redacted TEXT`). Additive; zero contact with existing `grey_two` tables or any `wpv_*`.
- Indices: `refuel_log_pkey` + `refuel_log_ticked_at_idx` + `refuel_log_status_idx` (3).
- Grants: `grey_pipeline_rw` → INSERT, SELECT on `refuel_log`. NOTE: UPDATE/DELETE remained granted via `grey_two`'s ALTER DEFAULT PRIVILEGES (a plain GRANT does not cancel them) — corrected by `20260716090000` (FDQ-52).
- `supabase_migrations.schema_migrations` on remote: **untouched** (psql apply, not CLI push).
- Anomalies: append-only REVOKE omitted at create (authoring defect, caught by Kov's grant verify) → corrected by the FDQ-52 migration below.

## 20260716090000_refuel_log_append_only (Movement 5 Phase F — FDQ-52)

- File: `supabase/migrations/20260716090000_refuel_log_append_only.sql`
- sha256: `1241bb7ec20ecad4fdef7153371e0f6fc1d4f3b95117417b6056923785ec9a21`
- Applied at: ~2026-07-16 (UTC), exact time not recorded — landed shortly after `create_refuel_log`, same Forces-lane session. Ledger back-filled by Kov 2026-07-17.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260716090000_refuel_log_append_only.sql`.
- Purpose: FDQ-52 corrective — restore append-only posture on `grey_two.refuel_log`. The create-migration's GRANT did not cancel `grey_two`'s ALTER DEFAULT PRIVILEGES (UPDATE/DELETE auto-granted to `grey_pipeline_rw`); this REVOKEs them so the runtime role can INSERT/SELECT only.
- Effects: `REVOKE UPDATE, DELETE, TRUNCATE ON grey_two.refuel_log FROM grey_pipeline_rw` + refreshed table COMMENT. Idempotent (REVOKE of an already-absent privilege is a no-op).
- `supabase_migrations.schema_migrations` on remote: **untouched** (psql apply, not CLI push).
- Anomalies: none — this IS the corrective for the create-migration omission.

## id=207 error_detail scrub (Movement 5 Phase F — FDQ-56)

- Type: one-off data scrub (not a migration file).
- Applied at: 2026-07-17 ~20:5x UTC (this session), exact time not recorded — minutes after row 207 was written (`ticked_at 2026-07-17 20:47:13.756845+00`). Drafted by Kov, run Forces-lane.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f /tmp/scrub207.sql` (temp file removed after).
- Statement: `UPDATE grey_two.refuel_log SET error_detail_redacted = '[REDACTED FDQ-56: RPC URL with key; error_class retained]' WHERE id = 207;`
- Rationale: row 207 persisted a keyed Alchemy RPC URL in `error_detail_redacted`, written before the FDQ-56 sink-layer `redactError()` choke point landed (grey/main `e6b3279`, #24). Owner-cred UPDATE required — the runtime role `grey_pipeline_rw` is INSERT/SELECT-only (FDQ-52, above).
- Result: `UPDATE 1` (1 of 208 rows). Post-verify: `has_url_after = f`, `error_class = TransactionExecutionError` retained, `error_detail_redacted` = the placeholder marker.
- Scope: single row, `grey_two.refuel_log` only. Zero contact with any other `grey_two` table or any `wpv_*`. The 52 cosmetic public-URL rows (no key) left as-is (Forces ruling — not a security exposure).
- `supabase_migrations.schema_migrations` on remote: **untouched**.
- Anomalies: none.

## 20260719140000_create_grey_two_reputation (Movement 6 Phase B)

- File: `supabase/migrations/20260719140000_create_grey_two_reputation.sql`
- sha256: `93084FDB0359AEB0D7D6CC922099FFA71D3D6AD51D1229A3C860E41F6FF5BB5A`
- Applied at: ~2026-07-19 (UTC), Forces-lane session.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260719140000_create_grey_two_reputation.sql` (M6 Phase B run sheet, PowerShell). Supabase CLI NOT used (shared `schema_migrations` with plugin-wpv).
- Purpose: M6 shadow reputation-gate state — re-homes buyer-reputation data out of the untouchable `autognostic.wpv_buyer_records`/`wpv_tracked_jobs` into grey's own `grey_two` schema (M6 Q4 ruling). Additive; zero contact with existing `grey_two` tables or any `wpv_*`.
- Tables created: `grey_two.{buyer_records, tracked_jobs}` (2). `buyer_records`: 10 cols, `text` PK (`wallet_address`). `tracked_jobs`: 8 cols, composite PK (`chain_id, job_id`).
- Indices: `grey_buyer_status_idx`, `grey_tracked_status_idx`, `grey_tracked_buyer_idx` (3 named) + 2 PK = 5.
- Grants (FDQ-65): `grey_pipeline_rw` → USAGE on schema, SELECT/INSERT/UPDATE on both tables; REVOKE DELETE/TRUNCATE. **UPDATE deliberately KEPT** (buyer status transitions + tracked-job resolution) — the OPPOSITE of the append-only audit tables (`sweep_log`/`refuel_log`). Correct-by-construction: the explicit REVOKE executed inside the successful `--single-transaction` apply, cancelling `grey_two`'s ALTER DEFAULT PRIVILEGES auto-grant for DELETE/TRUNCATE while retaining UPDATE (cf. `refuel_log` FDQ-52, where the REVOKE was omitted). No sequence grants (`text` / composite PK — no BIGSERIAL/IDENTITY).
- `supabase_migrations.schema_migrations` on remote: **untouched** (psql apply, not CLI push).
- Anomalies: none reported. `\dp` visual grant verify (run-sheet block 6) confirmed by Forces: `grey_pipeline_rw=arw/...` on both tables, no `d` (DELETE) or `D` (TRUNCATE). FDQ-65 posture verified both by the in-transaction REVOKE and by visual `\dp` inspection.
