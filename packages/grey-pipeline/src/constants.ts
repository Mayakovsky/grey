// grey-pipeline — Configuration constants (verification-pipeline subset).
// Ported from plugin-wpv/src/constants.ts; discovery/selection/fork/ACP/supabase
// constants dropped. Thresholds, weights, keywords, and prompts-adjacent config
// preserved verbatim (bug-preservation rule).

import type { ScoreWeights } from '@grey/schemas';

// ── LLM ──────────────────────────────────────

/**
 * Default model for claim extraction / evaluation.
 *
 * D-MODEL (Movement 1 Step 2): plugin-wpv used `claude-sonnet-4-20250514`, which is
 * deprecated and retires 2026-06-15. Bumped to `claude-sonnet-4-6` (same Sonnet tier,
 * identical pricing — see LLM_PRICING below). This is the one logged deviation from
 * "logic unchanged," forced by the model retirement. Env-overridable via GREY_MODEL
 * (or the legacy WPV_MODEL).
 */
export const GREY_MODEL =
  process.env.GREY_MODEL ?? process.env.WPV_MODEL ?? 'claude-sonnet-4-6';

/** Max output tokens for claim extraction */
export const CLAIM_EXTRACTION_MAX_TOKENS = 4096;

// ── Cost tracking ────────────────────────────

/**
 * Anthropic pricing per token (Claude Sonnet 4.6).
 * Rates: $3.00 / 1M input, $15.00 / 1M output.
 * Source: https://platform.claude.com/docs/en/about-claude/model-deprecations
 * (and the Claude models/pricing table), verified at audit date 2026-06-08.
 * Identical to the prior Sonnet-4 rates, so the cost-telemetry table is unchanged.
 */
export const LLM_PRICING = {
  inputPerToken: 3.0 / 1_000_000, // $3.00 / 1M input tokens
  outputPerToken: 15.0 / 1_000_000, // $15.00 / 1M output tokens
} as const;

// ── Verification ─────────────────────────────

/** Default score weights for claim evaluation aggregation */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  mathValidity: 0.35,
  benchmarks: 0.2,
  citations: 0.2,
  originality: 0.15,
  consistency: 0.1,
};

/** Verdict thresholds */
export const VERDICT_THRESHOLDS = {
  PASS: 70, // >= 70
  CONDITIONAL: 40, // >= 40 and < 70
  // < 40 → FAIL
} as const;

/** Minimum evaluable claims before INSUFFICIENT_DATA overrides score */
export const MIN_EVALUABLE_CLAIMS = 3;

/** Hype vs. Tech ratio threshold for scam alert flag */
export const HYPE_TECH_RATIO_THRESHOLD = 3.0;

/** Hype marketing keywords */
export const HYPE_KEYWORDS = [
  'revolutionary',
  'game-changing',
  'moonshot',
  '100x',
  'disruptive',
  'moon',
  'lambo',
  'guaranteed',
  'risk-free',
  'passive income',
  'generational wealth',
  'next bitcoin',
  'exponential',
] as const;

/** Technical indicator tokens */
export const TECH_KEYWORDS = [
  'algorithm',
  'protocol',
  'consensus',
  'merkle',
  'hash',
  'validator',
  'proof',
  'theorem',
  'function',
  'contract',
  'mapping',
  'modifier',
  'finality',
  'byzantine',
  'latency',
  'throughput',
  'shard',
  'rollup',
  'zk-snark',
  'zk-stark',
] as const;

// ── MiCA compliance ──────────────────────────

/** Keywords that indicate a whitepaper claims MiCA compliance */
export const MICA_CLAIM_KEYWORDS = [
  'mica',
  'markets in crypto-assets',
  'regulation (eu) 2023/1114',
  'esma whitepaper',
  'mica regulation',
  'mica complian',
  'eu crypto regulation',
  'mifid ii',
] as const;

/** The 7 required MiCA whitepaper sections (EU Regulation 2023/1114, Article 6) */
export const MICA_REQUIRED_SECTIONS = [
  'issuer_identity',
  'technology_description',
  'risk_disclosure',
  'rights_obligations',
  'redemption_mechanisms',
  'governance',
  'environmental_impact',
] as const;

/** Section detection patterns for each MiCA requirement. */
export const MICA_SECTION_PATTERNS: Record<string, RegExp[]> = {
  issuer_identity: [
    /\bissuer\b/i,
    /\bcompany\s+(?:information|details|identity)\b/i,
    /\blegal\s+entity\b/i,
    /\bcontact\s+(?:information|details)\b/i,
    /\bregistered\s+(?:office|address)\b/i,
    /\babout\s+(?:us|the\s+(?:company|issuer|team))\b/i,
    /\bcorporate\s+(?:structure|overview|information)\b/i,
    /\borganiz(?:ation|ational)\s+(?:structure|overview)\b/i,
  ],
  technology_description: [
    /\btechnical\s+(?:architecture|design|overview|specification)\b/i,
    /\bprotocol\s+design\b/i,
    /\bsystem\s+architecture\b/i,
    /\btechnology\s+(?:stack|description|overview)\b/i,
    /\bhow\s+(?:it\s+works|the\s+protocol\s+works)\b/i,
    /\bsmart\s+contract\s+(?:architecture|design|overview)\b/i,
    /\bminting\s+(?:and\s+)?(?:burning|redemption)\s+(?:mechanism|process)\b/i,
    /\breserve\s+(?:management|backing|mechanism)\b/i,
  ],
  risk_disclosure: [
    /\brisk\s+(?:disclosure|factors?|warning|management|assessment|framework)\b/i,
    /\brisk\b.*\b(?:section|chapter)\b/i,
    /\binvestment\s+risks?\b/i,
    /\bregulatory\s+risks?\b/i,
    /\boperational\s+risks?\b/i,
    /\bmarket\s+risks?\b/i,
    /\bcounterparty\s+risks?\b/i,
    /\bliquidity\s+risks?\b/i,
    /\brisk\s+disclaimer\b/i,
    /\bdisclaimer\b.*\brisk/i,
  ],
  rights_obligations: [
    /\brights?\s+(?:and\s+)?obligations?\b/i,
    /\btoken\s+holder\s+rights?\b/i,
    /\blegal\s+rights?\b/i,
    /\bvoting\s+rights?\b/i,
    /\bholder\s+rights?\b/i,
    /\buser\s+rights?\b/i,
    /\bterms\s+(?:of\s+service|and\s+conditions|of\s+use)\b/i,
    /\bredemption\s+rights?\b/i,
  ],
  redemption_mechanisms: [
    /\bredemption\b/i,
    /\brefund\b/i,
    /\bbuyback\b/i,
    /\bwithdrawal\s+mechanism\b/i,
    /\bexit\s+mechanism\b/i,
    /\bmint(?:ing)?\s+(?:and\s+)?(?:redeem|burn)\b/i,
    /\bconversion\s+mechanism\b/i,
    /\bpeg\s+(?:stability|mechanism|maintenance)\b/i,
  ],
  governance: [
    /\bgovernance\b/i,
    /\bdao\b/i,
    /\bvoting\b/i,
    /\bdecision.?making\b/i,
    /\bproposal\b/i,
    /\bgovernance\s+(?:framework|structure|model)\b/i,
    /\bcompliance\s+(?:framework|program|oversight)\b/i,
    /\bregulatory\s+(?:framework|compliance|oversight)\b/i,
  ],
  environmental_impact: [
    /\benvironmental\s+(?:impact|disclosure|considerations?)\b/i,
    /\bcarbon\s+(?:footprint|offset|neutral)\b/i,
    /\benergy\s+consumption\b/i,
    /\bsustainability\s+(?:report|assessment|disclosure|commitment)\b/i,
    /\besg\b/i,
    /\bclimate\s+(?:impact|disclosure|commitment|risk)\b/i,
  ],
} as const;

/** MiCA compliance thresholds */
export const MICA_THRESHOLDS = {
  COMPLIANT: 5, // >=5 of 7 sections → YES
  PARTIAL: 3, // >=3 and <5 → PARTIAL
  // <3 → NO
} as const;
