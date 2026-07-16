-- Movement 5 Phase F — FDQ-52 corrective: grey_two.refuel_log append-only
--
-- The create-migration (20260715120000) granted INSERT, SELECT — but grey_two's
-- ALTER DEFAULT PRIVILEGES (set at schema creation) auto-applies UPDATE/DELETE to
-- every new table for grey_pipeline_rw, and a plain GRANT does not cancel them.
-- sweep_log (M4) handled this with an explicit REVOKE; refuel_log's migration
-- omitted it (Desktop authoring defect, caught by Kov's F3 grant verify).
-- This restores the append-only posture an audit table requires: the runtime
-- role can add and read rows, never rewrite or erase them.
--
-- EXECUTION: canonical path ONLY — psql + WPV_DATABASE_URL, Forces-lane, then
-- ledger entry in supabase/applied_migrations.md. Idempotent: REVOKE of an
-- already-absent privilege is a no-op, so re-application is harmless.

REVOKE UPDATE, DELETE, TRUNCATE ON grey_two.refuel_log FROM grey_pipeline_rw;

COMMENT ON TABLE grey_two.refuel_log IS
  'Phase F relayer-refuel audit: one row per non-steady-state refuel evaluation (ok/insufficient_usdc/quote_oob/failed; silent skips are not persisted). APPEND-ONLY for the runtime role (INSERT+SELECT; FDQ-52).';
