-- 20260719140000_create_grey_two_reputation.sql
-- M6 Phase B (Forces-lane, ADDITIVE). Two new empty grey_two tables for the M6
-- shadow reputation gate. Zero contact with existing grey_two tables or any wpv_*.
--
-- FDQ-65 GRANT POSTURE — the OPPOSITE of the append-only audit tables:
--   grey_two's ALTER DEFAULT PRIVILEGES auto-grants UPDATE/DELETE to grey_pipeline_rw.
--   Audit tables (sweep_log, refuel_log via 20260716090000) REVOKE them to stay append-only.
--   These reputation tables are the FIRST grey_two tables that NEED UPDATE (buyer status
--   transitions clean->warned->timeout->blocked; tracked-job status + resolved_at), so we
--   KEEP UPDATE and REVOKE only DELETE/TRUNCATE. Do NOT copy the append-only REVOKE here.
--
-- EXECUTION: canonical path ONLY — psql + WPV_DATABASE_URL, Forces-lane, then ledger entry.

CREATE TABLE grey_two.buyer_records (
  wallet_address                  text PRIMARY KEY,
  status                          text NOT NULL DEFAULT 'clean',
  strikes                         integer NOT NULL DEFAULT 0,
  timeout_until                   timestamptz,
  last_stiff_at                   timestamptz,
  cross_provider_completes_total  integer NOT NULL DEFAULT 0,
  cross_provider_creates_total    integer NOT NULL DEFAULT 0,
  cross_provider_data_cached_at   timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grey_buyer_status_idx ON grey_two.buyer_records (status);

CREATE TABLE grey_two.tracked_jobs (
  chain_id           integer NOT NULL,
  job_id             text NOT NULL,
  buyer_address      text NOT NULL,
  provider_offering  text NOT NULL,
  submitted_at       timestamptz NOT NULL,
  expires_at         timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'submitted',
  resolved_at        timestamptz,
  PRIMARY KEY (chain_id, job_id)
);
CREATE INDEX grey_tracked_status_idx ON grey_two.tracked_jobs (status);
CREATE INDEX grey_tracked_buyer_idx  ON grey_two.tracked_jobs (buyer_address);

-- FDQ-65 grants — KEEP UPDATE, revoke destructive verbs. No sequence grants (text/composite PK).
GRANT USAGE ON SCHEMA grey_two TO grey_pipeline_rw;
GRANT SELECT, INSERT, UPDATE ON grey_two.buyer_records, grey_two.tracked_jobs TO grey_pipeline_rw;
REVOKE DELETE, TRUNCATE      ON grey_two.buyer_records, grey_two.tracked_jobs FROM grey_pipeline_rw;

COMMENT ON TABLE grey_two.buyer_records IS
  'M6 buyer-reputation state (status/strikes/timeout, cross-provider tallies). Runtime role grey_pipeline_rw: SELECT/INSERT/UPDATE (FDQ-65 — needs UPDATE for status transitions; DELETE/TRUNCATE revoked).';
COMMENT ON TABLE grey_two.tracked_jobs IS
  'M6 tracked ACP jobs for reputation resolution. Runtime role grey_pipeline_rw: SELECT/INSERT/UPDATE (FDQ-65; DELETE/TRUNCATE revoked).';
