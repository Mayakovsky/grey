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

## 20260806224500_grey_two_enable_rls (CDP Bazaar investigation — RLS defense-in-depth)

- File: `supabase/migrations/20260806224500_grey_two_enable_rls.sql`
- sha256: `d47c7b975fc925f9eafd5a603f35b9a63c70d6275ae4ca487e32e46ebd0abd89` — computed by Desktop from
  the file's read content (not run directly on the file by a separate tool on Forces' machine or
  the VPS; noted for transparency, unlike every prior entry's hash).
- Applied at: 2026-08-06 (UTC), exact time not recorded — Forces ran the apply himself via his own
  owner-cred psql session; his Steps 1–4 console output was never relayed to Desktop. **Applied
  state independently confirmed clean by Kov 2026-08-07**
  (`CDP-BAZAAR-EXTENSION-RESPONSES-CHECK-REPORT-KOV.md`, Task 2) via direct `pg_class`/`pg_policies`
  query through `grey_pipeline_rw` — not inferred from Forces' unconfirmed session. Ledger entry
  written by Desktop 2026-08-07 once that independent confirmation was in hand.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260806224500_grey_two_enable_rls.sql` (PowerShell, local Windows machine — see `CDP-BAZAAR-RLS-APPLY-RUNBOOK-FORCES.md` for the exact step-by-step).
- Purpose: enable RLS on all 10 `grey_two` tables in response to a Supabase advisory flag. Corrected
  severity noted in the migration file's own header before drafting: `anon`/`authenticated` already
  had zero schema-level `USAGE` and zero table grants on `grey_two` (checked live, not assumed), so
  this closes no currently-open exposure — it's defense-in-depth against a future grant/schema
  change failing open instead of failing safe. Drafted by Kov, reviewed by Desktop, approved by
  Forces (`CDP-BAZAAR-SETTLEMENT-AUDIT-AND-RLS-DRAFT-KOV-directive.md`, Track A).
- Tables affected: all 10 existing `grey_two` tables (no new tables) —
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`, one policy set per table scoped
  to each table's real, traced call-site usage (full trace in the migration file's own comments
  and in `CDP-BAZAAR-SETTLEMENT-AUDIT-AND-RLS-DRAFT-REPORT-KOV.md`). 24 policies total, every
  `roles` array `{grey_pipeline_rw}` only — no `anon`/`authenticated`/`public` policy anywhere.
  Deliberately no `FORCE ROW LEVEL SECURITY` (would break the existing owner-cred bypass pattern
  this exact ledger's manual-psql apply mechanism depends on).
- `supabase_migrations.schema_migrations` on remote: **untouched** (psql apply, not CLI push).
- Verification (independent, 2026-08-07): `relrowsecurity = t` on all 10 tables; `pg_policies`
  shows 24 rows, all scoped to `grey_pipeline_rw` only. Smoke test clean (health check + 2 fresh
  unpaid-route `402`s). Stronger than the synthetic checks: settlement #5's real
  `revenue_events` INSERT (2026-08-07 15:14:12 UTC) landed successfully *after* this migration
  applied — the write path was proven under real production load, not just a permission-metadata
  read.
- Anomalies: two tables (`buyer_records`, `tracked_jobs`) are policied on trusted prior-migration
  grant intent rather than independently re-derived call sites — nothing in this monorepo writes
  either (likely the separate ElizaOS ACP adapter). Explicitly flagged as lower-confidence in the
  migration file itself; not a reason this entry was held. Five of the eight remaining tables
  (`requests`, `verifications`, `claims`, `cost_events`, and `refuel_log`'s SELECT) carry grants
  broader than any call site in this repo currently exercises (default-privilege carryover from
  `grey_two`'s original `ALTER DEFAULT PRIVILEGES`) — flagged inline in the migration, not
  narrowed (narrowing an existing grant is a separate, riskier action than adding RLS on top, out
  of scope for this pass).

## 20260730150000_create_grey_two_revenue_events (Expansion E1-F)

- File: `supabase/migrations/20260730150000_create_grey_two_revenue_events.sql`
- sha256: `C15F09F0A56C12CB5171BAB93EC961AB1244904C229D1A899B5B51674092ECB5`
- Applied at: 2026-08-02 20:57 UTC, Forces-lane session.
- Applied by: Forces-lane via `psql -w -v ON_ERROR_STOP=1 --single-transaction -d <WPV_DATABASE_URL> -f supabase/migrations/20260730150000_create_grey_two_revenue_events.sql`.
- Purpose: E1-F margin instrumentation, revenue side — one new APPEND-ONLY `grey_two` table, one row per settled payment, attributed by channel × offering. Pairs with existing `grey_two.cost_events` (compute spend) to compute realized margin; cost is attributed per-offering only, not per-channel, per the deliberate scoping note in `computeMarginReport()`. Zero contact with any other `grey_two` table or any `wpv_*`.
- Tables created: `grey_two.revenue_events` (1). 6 columns, `uuid` PK (`gen_random_uuid()`), FK to `grey_two.requests(id)` on delete set null.
- Indices: `grey_revenue_channel_offering_idx`, `grey_revenue_settled_at_idx`, `grey_revenue_request_idx` (3 named) + 1 PK = 4.
- Grants (FDQ-52 posture): `grey_pipeline_rw` → USAGE on schema, SELECT/INSERT on the table; REVOKE UPDATE/DELETE/TRUNCATE executed inside the same transaction as the CREATE TABLE (learned from `refuel_log`'s original omission — not split into a later corrective migration this time). Verified via `\dp`: `grey_pipeline_rw=ar/postgres`, no `w`/`d`/`D`.
- `supabase_migrations.schema_migrations` on remote: **untouched** (psql apply, not CLI push).
- Anomalies: none. Table, indexes, grants, and table comment all confirmed post-apply via `\d`, `\dp`, and `obj_description()`.

## 20260811230000_grey_two_redact_column_grants (BION-DIRECTIVE-42 Tier 1)

- File: `supabase/migrations/20260811230000_grey_two_redact_column_grants.sql`
- sha256: `a8adcc2773bc3463e8886fa6be16eda8a8ba462ce68c7aa3f8f9a41cc21ab0e6`
- Applied at/by: 2026-08-11, Desktop (direct Supabase execute access, not psql — see `BION-DIRECTIVE-42-STATUS.md` and the chat record for the exact verification queries run). Differs from every prior entry's apply mechanism (`WPV_DATABASE_URL` + psql) — noted explicitly rather than silently implied to match the usual pattern.
- Purpose: durable, column-scoped `UPDATE` for `grey_pipeline_rw` on exactly `grey_two.sweep_log.error_msg` and `grey_two.refuel_log.error_detail_redacted` — the two free-text error columns a real secret (a leaked RPC key, D-40/D-41) can land in and need redacting, without weakening either table's append-only guarantee for anything else. Both a column `GRANT` and a matching `FOR UPDATE` RLS policy were required — confirmed live before drafting that RLS alone would otherwise silently reject the write even with the grant present (both tables already had RLS enabled, `SELECT`/`INSERT` policies only). Full design rationale in the migration file itself and `BION-DIRECTIVE-42-STATUS.md`.
- Tables affected: `grey_two.sweep_log`, `grey_two.refuel_log` — no new tables, no other column touched on either.
- Verification, independently re-confirmed 2026-08-11 (BION-DIRECTIVE-44), not just trusting the D-42 status draft's placeholder: `information_schema.column_privileges` — exactly one grantable `UPDATE` column per table (`sweep_log.error_msg`, `refuel_log.error_detail_redacted`), nothing else. `pg_policies` — both new `FOR UPDATE` policies present (`grey_pipeline_rw_update_error_msg`, `grey_pipeline_rw_update_error_detail`), scoped to `grey_pipeline_rw` only, alongside the pre-existing `SELECT`/`INSERT` policies (no policy removed). **Stronger than a catalog read alone:** also ran a real live-credential write test — the exact D-41 scrub statement, via `GREY_PG_URL` (`grey_pipeline_rw`, no owner cred), against the real 16 flagged `sweep_log` rows (ids 884–899). Result: `UPDATE 16` succeeded (proving the grant/policy pair genuinely admits the write, not just that the catalog says it should); the rows were already redacted before this run (Desktop had evidently already scrubbed them directly, consistent with their DB access at apply time) — re-verified before and after via direct `SELECT ... WHERE error_msg ILIKE '%alchemy%'`, **zero rows** contain the raw key either way. D-41's original scrub task is now closed for real, not just prepared.
- `supabase_migrations.schema_migrations` on remote: not applicable (Supabase execute access, not psql/CLI apply).
- Anomalies: none. The draft ledger entry in `BION-DIRECTIVE-42-STATUS.md` said "fill in post-apply — attempt UPDATE and confirm" as the expected verification shape; what actually happened was a catalog-based check (Desktop) plus this session's independent catalog re-check *and* a real write test — stronger evidence than either alone, recorded here rather than silently treated as equivalent to the draft's original assumption.
