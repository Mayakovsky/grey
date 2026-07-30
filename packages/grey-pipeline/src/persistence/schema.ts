// grey_two schema — Drizzle ORM definitions.
// Hand-authored to mirror supabase/migrations/20260610001048_create_grey_two_schema.sql
// (the SQL file is the canonical source of truth; this mirrors it for typed queries).
// Five tables: whitepapers, requests, verifications, claims, cost_events.
// No `embeddings` table (Movement 1 Step 2 extracts only what plugin-wpv has; it has
// no embeddings). No FKs cross into the autognostic (wpv_*) schema.

import {
  pgSchema,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  real,
  boolean,
  numeric,
  index,
} from 'drizzle-orm/pg-core';

export const greyTwo = pgSchema('grey_two');

// ── whitepapers (mirror of autognostic.wpv_whitepapers) ──────────────
export const whitepapers = greyTwo.table(
  'whitepapers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectName: text('project_name').notNull(),
    tokenAddress: text('token_address'),
    chain: text('chain').notNull().default('base'),
    documentUrl: text('document_url').notNull(),
    ipfsCid: text('ipfs_cid'),
    knowledgeItemId: text('knowledge_item_id'),
    pageCount: integer('page_count').notNull().default(0),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
    status: text('status').notNull().default('DISCOVERED'),
    selectionScore: real('selection_score').notNull().default(0),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    index('grey_wp_project_chain_idx').on(t.projectName, t.chain),
    index('grey_wp_status_idx').on(t.status),
    index('grey_wp_token_addr_idx').on(t.tokenAddress),
  ],
);

// ── requests (incoming request audit trail) ──────────────────────────
export const requests = greyTwo.table(
  'requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offering: text('offering').notNull(),
    subject: jsonb('subject').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('received'), // received|completed|failed
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('grey_requests_created_at_idx').on(t.createdAt)],
);

// ── verifications (mirror of autognostic.wpv_verifications) ───────────
export const verifications = greyTwo.table(
  'verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    whitepaperId: uuid('whitepaper_id')
      .notNull()
      .references(() => whitepapers.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'set null' }),
    structuralAnalysisJson: jsonb('structural_analysis_json').$type<Record<string, unknown>>(),
    structuralScore: real('structural_score'),
    confidenceScore: real('confidence_score'),
    hypeTechRatio: real('hype_tech_ratio'),
    verdict: text('verdict'),
    focusAreaScores: jsonb('focus_area_scores').$type<Record<string, number | null>>(),
    totalClaims: integer('total_claims').notNull().default(0),
    verifiedClaims: integer('verified_claims').notNull().default(0),
    reportJson: jsonb('report_json').$type<Record<string, unknown>>(),
    llmTokensUsed: integer('llm_tokens_used').notNull().default(0),
    computeCostUsd: numeric('compute_cost_usd', { precision: 12, scale: 6, mode: 'number' })
      .notNull()
      .default(0),
    triggerSource: text('trigger_source'),
    cacheHit: boolean('cache_hit').default(false),
    l1DurationMs: integer('l1_duration_ms').default(0),
    l2InputTokens: integer('l2_input_tokens').default(0),
    l2OutputTokens: integer('l2_output_tokens').default(0),
    l2CostUsd: numeric('l2_cost_usd', { precision: 12, scale: 6, mode: 'number' }).default(0),
    l2DurationMs: integer('l2_duration_ms').default(0),
    l3InputTokens: integer('l3_input_tokens').default(0),
    l3OutputTokens: integer('l3_output_tokens').default(0),
    l3CostUsd: numeric('l3_cost_usd', { precision: 12, scale: 6, mode: 'number' }).default(0),
    l3DurationMs: integer('l3_duration_ms').default(0),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('grey_verif_wp_id_idx').on(t.whitepaperId),
    index('grey_verif_verdict_idx').on(t.verdict),
    index('grey_verif_request_idx').on(t.requestId),
  ],
);

// ── claims (mirror of autognostic.wpv_claims) ────────────────────────
export const claims = greyTwo.table(
  'claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    whitepaperId: uuid('whitepaper_id')
      .notNull()
      .references(() => whitepapers.id, { onDelete: 'cascade' }),
    category: text('category').notNull(), // ClaimCategory enum value
    claimText: text('claim_text').notNull(),
    statedEvidence: text('stated_evidence').notNull().default(''),
    sourceSection: text('source_section').notNull().default(''),
    mathProofPresent: boolean('math_proof_present').notNull().default(false),
    evaluationJson: jsonb('evaluation_json').$type<Record<string, unknown>>(),
    claimScore: real('claim_score'), // 0–100
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
  },
  (t) => [
    index('grey_claims_wp_id_idx').on(t.whitepaperId),
    index('grey_claims_category_idx').on(t.category),
  ],
);

// ── cost_events (one row per LLM call; CONTENT-FREE per claims-only logging) ──
export const costEvents = greyTwo.table(
  'cost_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'set null' }),
    verificationId: uuid('verification_id').references(() => verifications.id, {
      onDelete: 'set null',
    }),
    stage: text('stage').notNull(), // l1|l2|l3
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('grey_cost_created_at_idx').on(t.createdAt),
    index('grey_cost_request_idx').on(t.requestId),
    index('grey_cost_verif_idx').on(t.verificationId),
  ],
);

// ── revenue_events (E1-F; one row per settled payment, channel x offering) ──
export const revenueEvents = greyTwo.table(
  'revenue_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'set null' }),
    channel: text('channel').notNull(), // 'x402' | 'acp' (@grey/schemas/pricing Channel)
    offering: text('offering').notNull(), // OfferingSlug
    revenueUsd: numeric('revenue_usd', { precision: 12, scale: 6, mode: 'number' })
      .notNull()
      .default(0),
    settledAt: timestamp('settled_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('grey_revenue_channel_offering_idx').on(t.channel, t.offering),
    index('grey_revenue_settled_at_idx').on(t.settledAt),
    index('grey_revenue_request_idx').on(t.requestId),
  ],
);

export type WhitepaperRow = typeof whitepapers.$inferSelect;
export type WhitepaperInsert = typeof whitepapers.$inferInsert;
export type RequestRow = typeof requests.$inferSelect;
export type RequestInsert = typeof requests.$inferInsert;
export type VerificationRow = typeof verifications.$inferSelect;
export type VerificationInsert = typeof verifications.$inferInsert;
export type ClaimRow = typeof claims.$inferSelect;
export type ClaimInsert = typeof claims.$inferInsert;
export type CostEventRow = typeof costEvents.$inferSelect;
export type CostEventInsert = typeof costEvents.$inferInsert;
export type RevenueEventRow = typeof revenueEvents.$inferSelect;
export type RevenueEventInsert = typeof revenueEvents.$inferInsert;
