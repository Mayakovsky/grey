-- 001_create_grey_two_schema.sql — Movement 1 Step 2 (grey-pipeline extraction)
-- Applied ONCE under explicit Forces authorization (Gate #2). grey_two is New Grey's
-- only writable schema. No FKs cross into the autognostic (wpv_*) schema.
-- Five tables: whitepapers, requests, verifications, claims, cost_events.
-- (No `embeddings` table — plugin-wpv generates no embeddings; that is future-movement work.)
-- USD costs are numeric(12,6) (freshened from plugin-wpv's `real`).
-- gen_random_uuid() is native on Supabase Postgres 15+ (no pgcrypto/pgvector needed).

CREATE SCHEMA IF NOT EXISTS grey_two;

-- ── whitepapers (mirror of autognostic.wpv_whitepapers) ──────────────
CREATE TABLE grey_two.whitepapers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name      text NOT NULL,
  token_address     text,
  chain             text NOT NULL DEFAULT 'base',
  document_url      text NOT NULL,
  ipfs_cid          text,
  knowledge_item_id text,
  page_count        integer NOT NULL DEFAULT 0,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'DISCOVERED',
  selection_score   real NOT NULL DEFAULT 0,
  metadata_json     jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX grey_wp_project_chain_idx ON grey_two.whitepapers (project_name, chain);
CREATE INDEX grey_wp_status_idx        ON grey_two.whitepapers (status);
CREATE INDEX grey_wp_token_addr_idx    ON grey_two.whitepapers (token_address);

-- ── requests (incoming request audit trail) ──────────────────────────
CREATE TABLE grey_two.requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering     text NOT NULL,
  subject      jsonb,                            -- {tokenAddress, projectName, ...}
  status       text NOT NULL DEFAULT 'received', -- received|completed|failed
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX grey_requests_created_at_idx ON grey_two.requests (created_at);

-- ── verifications (mirror of autognostic.wpv_verifications) ──────────
CREATE TABLE grey_two.verifications (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whitepaper_id            uuid NOT NULL REFERENCES grey_two.whitepapers(id) ON DELETE CASCADE,
  request_id               uuid REFERENCES grey_two.requests(id) ON DELETE SET NULL,
  structural_analysis_json jsonb,
  structural_score         real,
  confidence_score         real,
  hype_tech_ratio          real,
  verdict                  text,
  focus_area_scores        jsonb,
  total_claims             integer NOT NULL DEFAULT 0,
  verified_claims          integer NOT NULL DEFAULT 0,
  report_json              jsonb,
  llm_tokens_used          integer NOT NULL DEFAULT 0,
  compute_cost_usd         numeric(12,6) NOT NULL DEFAULT 0,
  trigger_source           text,
  cache_hit                boolean DEFAULT false,
  l1_duration_ms           integer DEFAULT 0,
  l2_input_tokens          integer DEFAULT 0,
  l2_output_tokens         integer DEFAULT 0,
  l2_cost_usd              numeric(12,6) DEFAULT 0,
  l2_duration_ms           integer DEFAULT 0,
  l3_input_tokens          integer DEFAULT 0,
  l3_output_tokens         integer DEFAULT 0,
  l3_cost_usd              numeric(12,6) DEFAULT 0,
  l3_duration_ms           integer DEFAULT 0,
  verified_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grey_verif_wp_id_idx   ON grey_two.verifications (whitepaper_id);
CREATE INDEX grey_verif_verdict_idx ON grey_two.verifications (verdict);
CREATE INDEX grey_verif_request_idx ON grey_two.verifications (request_id);

-- ── claims (mirror of autognostic.wpv_claims) ────────────────────────
CREATE TABLE grey_two.claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whitepaper_id      uuid NOT NULL REFERENCES grey_two.whitepapers(id) ON DELETE CASCADE,
  category           text NOT NULL,            -- ClaimCategory enum value
  claim_text         text NOT NULL,
  stated_evidence    text NOT NULL DEFAULT '',
  source_section     text NOT NULL DEFAULT '',
  math_proof_present boolean NOT NULL DEFAULT false,
  evaluation_json    jsonb,
  claim_score        real,                     -- 0–100
  evaluated_at       timestamptz
);
CREATE INDEX grey_claims_wp_id_idx    ON grey_two.claims (whitepaper_id);
CREATE INDEX grey_claims_category_idx ON grey_two.claims (category);

-- ── cost_events (one row per LLM call; CONTENT-FREE per claims-only logging) ──
CREATE TABLE grey_two.cost_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid REFERENCES grey_two.requests(id) ON DELETE SET NULL,
  verification_id uuid REFERENCES grey_two.verifications(id) ON DELETE SET NULL,
  stage           text NOT NULL,               -- l1|l2|l3
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grey_cost_created_at_idx ON grey_two.cost_events (created_at);
CREATE INDEX grey_cost_request_idx    ON grey_two.cost_events (request_id);
CREATE INDEX grey_cost_verif_idx      ON grey_two.cost_events (verification_id);
