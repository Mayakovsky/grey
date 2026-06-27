-- Migration: sweep_log table + role grants for sweeper writes
-- Applied at deploy time via the manual psql ledger (per invariant #10).
-- NOT applied during Phase A; this file is authored and committed, not executed.

CREATE TABLE IF NOT EXISTS grey_two.sweep_log (
  id          BIGSERIAL PRIMARY KEY,
  swept_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash     TEXT,
  amount_wei  NUMERIC(78, 0),
  source      TEXT NOT NULL,
  destination TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  error_class TEXT,
  error_msg   TEXT,
  chain_id    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sweep_log_swept_at ON grey_two.sweep_log (swept_at DESC);

GRANT USAGE ON SCHEMA grey_two TO grey_pipeline_rw;
GRANT INSERT, SELECT ON grey_two.sweep_log TO grey_pipeline_rw;
GRANT USAGE, SELECT ON SEQUENCE grey_two.sweep_log_id_seq TO grey_pipeline_rw;
REVOKE UPDATE, DELETE, TRUNCATE ON grey_two.sweep_log FROM grey_pipeline_rw;
