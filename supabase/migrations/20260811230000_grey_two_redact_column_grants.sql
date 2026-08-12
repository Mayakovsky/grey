-- 20260811230000_grey_two_redact_column_grants.sql
-- BION-DIRECTIVE-42 Tier 1 (Forces-lane bootstrap, once) — durable, narrow UPDATE access for
-- grey_pipeline_rw, scoped to exactly the two free-text error columns that exist for secret
-- redaction (D-41's blocker; FDQ-56/row-207 before it). Not general row editing: every other
-- column on both tables — status, tx_hash, amount_wei, chain_id, every timestamp, error_class —
-- stays exactly as immutable for the runtime role as it is today.
--
-- WHY BOTH A COLUMN GRANT AND AN RLS POLICY ARE NEEDED, NOT JUST ONE — confirmed against the live
-- schema before writing this, not assumed: both tables have ROW LEVEL SECURITY enabled
-- (20260806224500_grey_two_enable_rls.sql), with only SELECT/INSERT policies for
-- grey_pipeline_rw. RLS defaults to deny for any command with no matching policy for the role,
-- independent of the underlying GRANT — a bare `GRANT UPDATE (error_msg)` alone would silently
-- still be rejected by RLS with no policy to admit it. So this migration adds both layers:
--   1. GRANT UPDATE on exactly the one column (the real Postgres column-privilege mechanism —
--      https://www.postgresql.org/docs/current/sql-grant.html, `UPDATE (column_name)` form).
--   2. A matching `FOR UPDATE` RLS policy, `USING (true) WITH CHECK (true)` — permitting the
--      command on any row (mirrors every existing UPDATE policy on other grey_two tables, e.g.
--      requests/buyer_records/tracked_jobs in the same RLS-enable migration). The row-level
--      policy says WHICH ROWS; the column grant says WHICH COLUMNS — together they combine to
--      exactly "any row, only this one column", which is what a redaction scrub needs and nothing
--      more. Neither layer alone is sufficient; both together are also not broader than intended,
--      since the column grant still hard-blocks every other column regardless of the row policy.
--
-- SCOPE CHECK (per the directive's ask): audited both tables' full column lists and grepped the
-- whole grey_two schema for every other error/msg/detail-shaped column before writing this list —
-- confirmed only these two columns are (a) free-text error content written by the two production
-- call sites that use `redactError()` (packages/grey-sweeper/src/log.ts, src/refuel/log.ts) and
-- (b) currently unreachable for UPDATE by grey_pipeline_rw. A third column of the same general
-- shape exists — `grey_two.requests.error` (packages/grey-pipeline/src/persistence/
-- repositories.ts's `markFailed`, called from pipeline.ts:766 with a raw, unredacted
-- `(err as Error).message`) — but that table already grants grey_pipeline_rw full UPDATE (see
-- the RLS-enable migration's `requests` section), so this directive's access gap does not apply
-- to it; the real, unaddressed risk there is that nothing redacts the message BEFORE it's
-- written, a code fix in grey-pipeline, not a grant/RLS fix. Deliberately NOT bundled into this
-- migration — flagged in BION-DIRECTIVE-42's status report for separate follow-up.
--
-- EXECUTION: canonical path ONLY — psql + WPV_DATABASE_URL (owner/migration cred), Forces-lane.
-- This is the one bootstrap application this class of fix should ever need: once granted, every
-- future redaction (a leaked key, a leaked internal hostname, etc.) on either column is a plain
-- UPDATE grey_pipeline_rw can already run — D-41's class of problem does not need to route
-- through Forces again after this lands.

GRANT UPDATE (error_msg) ON grey_two.sweep_log TO grey_pipeline_rw;
CREATE POLICY grey_pipeline_rw_update_error_msg ON grey_two.sweep_log
  FOR UPDATE TO grey_pipeline_rw USING (true) WITH CHECK (true);

GRANT UPDATE (error_detail_redacted) ON grey_two.refuel_log TO grey_pipeline_rw;
CREATE POLICY grey_pipeline_rw_update_error_detail ON grey_two.refuel_log
  FOR UPDATE TO grey_pipeline_rw USING (true) WITH CHECK (true);

COMMENT ON TABLE grey_two.sweep_log IS
  'Movement 4 sweeper audit: one row per sweep tick (ok/failed/skipped). Runtime role grey_pipeline_rw: SELECT/INSERT always; UPDATE narrowly on error_msg only (BION-DIRECTIVE-42 Tier 1 — redact-only, e.g. a leaked RPC key), enforced at both the column-grant and RLS-policy layers. Every other column (status/tx_hash/amount_wei/chain_id/error_class/swept_at) remains immutable for the runtime role.';
COMMENT ON TABLE grey_two.refuel_log IS
  'Phase F relayer-refuel audit: one row per non-steady-state refuel evaluation (ok/insufficient_usdc/quote_oob/failed; silent skips are not persisted). Runtime role grey_pipeline_rw: SELECT/INSERT always (FDQ-52 append-only); UPDATE narrowly on error_detail_redacted only (BION-DIRECTIVE-42 Tier 1), enforced at both the column-grant and RLS-policy layers. Every other column remains immutable.';
