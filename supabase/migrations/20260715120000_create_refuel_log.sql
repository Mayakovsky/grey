-- Movement 5 Phase F — grey_two.refuel_log (spec §2)
-- Audit table for the sweeper's relayer gas refuel loop (USDC→ETH via Uniswap v3
-- DIRECT, delivered to the pinned relayer — invariants #21/#22).
--
-- EXECUTION: canonical path ONLY — psql + WPV_DATABASE_URL (owner/migration cred),
-- Forces-lane or on explicit Forces authorization, then record in
-- supabase/applied_migrations.md. The Supabase CLI is NOT used (shared
-- schema_migrations with plugin-wpv — M1 lesson).

CREATE TABLE grey_two.refuel_log (
  id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticked_at                   timestamptz NOT NULL DEFAULT now(),
  chain_id                    integer NOT NULL,
  relayer_balance_before_wei  numeric(38, 0) NOT NULL,
  deficit_wei                 numeric(38, 0),
  usdc_in                     numeric(38, 0),
  quote_out_wei               numeric(38, 0),
  min_out_wei                 numeric(38, 0),
  swap_tx                     text,
  unwrap_tx                   text,
  transfer_tx                 text,
  eth_delivered_wei           numeric(38, 0),
  status                      text NOT NULL CHECK (status IN ('ok', 'skipped', 'insufficient_usdc', 'quote_oob', 'failed')),
  error_class                 text,
  error_detail_redacted       text
);

COMMENT ON TABLE grey_two.refuel_log IS
  'Phase F relayer-refuel audit: one row per non-steady-state refuel evaluation (ok/insufficient_usdc/quote_oob/failed; silent skips are not persisted).';

CREATE INDEX refuel_log_ticked_at_idx ON grey_two.refuel_log (ticked_at DESC);
CREATE INDEX refuel_log_status_idx ON grey_two.refuel_log (status);

-- Runtime role: the sweeper writes and reads via GREY_PG_URL (grey_pipeline_rw).
GRANT INSERT, SELECT ON grey_two.refuel_log TO grey_pipeline_rw;
