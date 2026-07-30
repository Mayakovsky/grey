-- 20260730150000_create_grey_two_revenue_events.sql
-- E1-F (Expansion Round 2, sub-unit 4) — margin instrumentation, revenue side. One new
-- APPEND-ONLY grey_two table: one row per settled payment, attributed by channel x offering
-- (spec S2.6/S3 E1-F). Pairs with the existing grey_two.cost_events (compute spend) to compute
-- realized margin; cost_events has no channel dimension (compute cost is channel-agnostic --
-- see packages/grey-pipeline/src/persistence/repositories.ts's computeMarginReport() for the
-- deliberate scoping note on why cost is attributed per-offering, not per-channel, this round).
-- Zero contact with any existing grey_two table or any wpv_*.
--
-- FDQ-52/FDQ-65 GRANT POSTURE: append-only, same as cost_events/sweep_log/refuel_log -- the
-- runtime role (grey_pipeline_rw) gets INSERT+SELECT only. grey_two's ALTER DEFAULT PRIVILEGES
-- auto-grants UPDATE/DELETE to grey_pipeline_rw on every new table; this REVOKEs them explicitly
-- inside the same transaction as the CREATE TABLE (learned from refuel_log's FDQ-52 omission --
-- do NOT split the REVOKE into a later corrective migration).
--
-- EXECUTION: canonical path ONLY -- psql + WPV_DATABASE_URL, Forces-lane, then a ledger entry in
-- supabase/applied_migrations.md. NOT applied by this diff -- authored for Forces' apply.

CREATE TABLE grey_two.revenue_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid REFERENCES grey_two.requests(id) ON DELETE SET NULL,
  channel      text NOT NULL,               -- x402|acp (@grey/schemas/pricing Channel)
  offering     text NOT NULL,               -- OfferingSlug
  revenue_usd  numeric(12,6) NOT NULL DEFAULT 0,
  settled_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grey_revenue_channel_offering_idx ON grey_two.revenue_events (channel, offering);
CREATE INDEX grey_revenue_settled_at_idx       ON grey_two.revenue_events (settled_at);
CREATE INDEX grey_revenue_request_idx          ON grey_two.revenue_events (request_id);

GRANT USAGE ON SCHEMA grey_two TO grey_pipeline_rw;
GRANT SELECT, INSERT ON grey_two.revenue_events TO grey_pipeline_rw;
REVOKE UPDATE, DELETE, TRUNCATE ON grey_two.revenue_events FROM grey_pipeline_rw;

COMMENT ON TABLE grey_two.revenue_events IS
  'E1-F: one row per settled payment (channel x offering x revenueUsd), written at settlement time by grey-core (x402 HTTP routes, the MCP surface) after a successful settle(). APPEND-ONLY for the runtime role (INSERT+SELECT; mirrors cost_events/refuel_log FDQ-52 posture).';
