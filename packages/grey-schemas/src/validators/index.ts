// @grey/schemas/validators — ajv-compiled runtime validators (value-only barrel).
// One validator per offering payload + the full envelope. All schemas are added to a
// single Ajv2020 instance so cross-file $refs (responses -> _shared, envelope -> responses)
// resolve by $id. M3 selects the per-offering validator by `offering` slug, and validates
// the full wire response with envelopeValidator.
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import type { PaidOfferingSlug } from '../responses/types';

import sharedSchema from '../responses/v1/_shared.schema.json';
import legitimacyScanSchema from '../responses/v1/legitimacy_scan.schema.json';
import legitimacyScanTrustRungSchema from '../responses/v1/legitimacy_scan_trust_rung.schema.json';
import verifyWhitepaperSchema from '../responses/v1/verify_whitepaper.schema.json';
import verifyFullTechSchema from '../responses/v1/verify_full_tech.schema.json';
import claimExtractionSchema from '../responses/v1/claim_extraction.schema.json';
import claimHistorySchema from '../responses/v1/claim_history.schema.json';
import quickProtocolFactsSchema from '../responses/v1/quick_protocol_facts.schema.json';
import dailyTechBriefSchema from '../responses/v1/daily_tech_brief.schema.json';
import dailyGreenlightListSchema from '../responses/v1/daily_greenlight_list.schema.json';
import scamAlertFeedSchema from '../responses/v1/scam_alert_feed.schema.json';
import predictionMarketResearchSchema from '../responses/v1/prediction_market_research.schema.json';
import resolutionEvidenceCompilerSchema from '../responses/v1/resolution_evidence_compiler.schema.json';
import envelopeSchema from '../responses/v1/envelope.schema.json';

// M3 (Q7): request-body schemas for the 7 paid offerings (FDQ-10 — the 2 free GETs take no body).
import legitimacyScanRequestSchema from '../requests/v1/legitimacy_scan.schema.json';
import legitimacyScanTrustRungRequestSchema from '../requests/v1/legitimacy_scan_trust_rung.schema.json';
import verifyWhitepaperRequestSchema from '../requests/v1/verify_whitepaper.schema.json';
import verifyFullTechRequestSchema from '../requests/v1/verify_full_tech.schema.json';
import claimExtractionRequestSchema from '../requests/v1/claim_extraction.schema.json';
import claimHistoryRequestSchema from '../requests/v1/claim_history.schema.json';
import quickProtocolFactsRequestSchema from '../requests/v1/quick_protocol_facts.schema.json';
import dailyTechBriefRequestSchema from '../requests/v1/daily_tech_brief.schema.json';
import predictionMarketResearchRequestSchema from '../requests/v1/prediction_market_research.schema.json';
import resolutionEvidenceCompilerRequestSchema from '../requests/v1/resolution_evidence_compiler.schema.json';

const BASE = 'https://schemas.whitepapergrey.com/v1/';
const id = (file: string): string => `${BASE}${file}`;
const reqId = (file: string): string => `${BASE}requests/${file}`;

export const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

// _shared is referenced but never validated directly; the rest are addSchema'd so every
// cross-ref resolves before any compile (getSchema compiles lazily against the added set).
ajv.addSchema([
  sharedSchema,
  legitimacyScanSchema,
  legitimacyScanTrustRungSchema,
  verifyWhitepaperSchema,
  verifyFullTechSchema,
  claimExtractionSchema,
  claimHistorySchema,
  quickProtocolFactsSchema,
  dailyTechBriefSchema,
  dailyGreenlightListSchema,
  scamAlertFeedSchema,
  predictionMarketResearchSchema,
  resolutionEvidenceCompilerSchema,
  envelopeSchema,
  // M3 request schemas (distinct $id namespace: .../v1/requests/<file>).
  legitimacyScanRequestSchema,
  legitimacyScanTrustRungRequestSchema,
  verifyWhitepaperRequestSchema,
  verifyFullTechRequestSchema,
  claimExtractionRequestSchema,
  claimHistoryRequestSchema,
  quickProtocolFactsRequestSchema,
  dailyTechBriefRequestSchema,
  predictionMarketResearchRequestSchema,
  resolutionEvidenceCompilerRequestSchema,
]);

function compiled(file: string): ValidateFunction {
  const v = ajv.getSchema(id(file));
  if (!v) throw new Error(`@grey/schemas/validators: no compiled schema for ${file}`);
  return v;
}

function compiledRequest(file: string): ValidateFunction {
  const v = ajv.getSchema(reqId(file));
  if (!v) throw new Error(`@grey/schemas/validators: no compiled request schema for ${file}`);
  return v;
}

// Per-offering payload validators (validate the inner response shape).
export const legitimacyScanValidator = compiled('legitimacy_scan.schema.json');
export const legitimacyScanTrustRungValidator = compiled('legitimacy_scan_trust_rung.schema.json');
export const verifyWhitepaperValidator = compiled('verify_whitepaper.schema.json');
export const verifyFullTechValidator = compiled('verify_full_tech.schema.json');
export const claimExtractionValidator = compiled('claim_extraction.schema.json');
export const claimHistoryValidator = compiled('claim_history.schema.json');
export const quickProtocolFactsValidator = compiled('quick_protocol_facts.schema.json');
export const dailyTechBriefValidator = compiled('daily_tech_brief.schema.json');
export const dailyGreenlightListValidator = compiled('daily_greenlight_list.schema.json');
export const scamAlertFeedValidator = compiled('scam_alert_feed.schema.json');
export const predictionMarketResearchValidator = compiled('prediction_market_research.schema.json');
export const resolutionEvidenceCompilerValidator = compiled('resolution_evidence_compiler.schema.json');

// Full-envelope validator (validates wrapper + payload-XOR-error + if/then payload binding).
export const envelopeValidator = compiled('envelope.schema.json');

/** Per-offering validator lookup by canonical slug. */
export const offeringValidators: Record<string, ValidateFunction> = {
  legitimacy_scan: legitimacyScanValidator,
  legitimacy_scan_trust_rung: legitimacyScanTrustRungValidator,
  verify_whitepaper: verifyWhitepaperValidator,
  verify_full_tech: verifyFullTechValidator,
  claim_extraction: claimExtractionValidator,
  claim_history: claimHistoryValidator,
  quick_protocol_facts: quickProtocolFactsValidator,
  daily_tech_brief: dailyTechBriefValidator,
  daily_greenlight_list: dailyGreenlightListValidator,
  scam_alert_feed: scamAlertFeedValidator,
  prediction_market_research: predictionMarketResearchValidator,
  resolution_evidence_compiler: resolutionEvidenceCompilerValidator,
};

// ── M3 (Q7): request-body validators for the 7 paid offerings ──
// Compiled via the SAME shared Ajv2020 instance. grey-core's Fastify setValidatorCompiler
// delegates request-body validation to these (no second ajv instance — HC#12).

export const legitimacyScanRequestValidator = compiledRequest('legitimacy_scan.schema.json');
export const legitimacyScanTrustRungRequestValidator = compiledRequest('legitimacy_scan_trust_rung.schema.json');
export const verifyWhitepaperRequestValidator = compiledRequest('verify_whitepaper.schema.json');
export const verifyFullTechRequestValidator = compiledRequest('verify_full_tech.schema.json');
export const claimExtractionRequestValidator = compiledRequest('claim_extraction.schema.json');
export const claimHistoryRequestValidator = compiledRequest('claim_history.schema.json');
export const quickProtocolFactsRequestValidator = compiledRequest('quick_protocol_facts.schema.json');
export const dailyTechBriefRequestValidator = compiledRequest('daily_tech_brief.schema.json');
export const predictionMarketResearchRequestValidator = compiledRequest(
  'prediction_market_research.schema.json',
);
export const resolutionEvidenceCompilerRequestValidator = compiledRequest(
  'resolution_evidence_compiler.schema.json',
);

/** Per-paid-offering request-body validator lookup (8 entries; the 2 free GETs have no body — FDQ-10). */
export const offeringRequestValidators: Record<PaidOfferingSlug, ValidateFunction> = {
  legitimacy_scan: legitimacyScanRequestValidator,
  legitimacy_scan_trust_rung: legitimacyScanTrustRungRequestValidator,
  verify_whitepaper: verifyWhitepaperRequestValidator,
  verify_full_tech: verifyFullTechRequestValidator,
  claim_extraction: claimExtractionRequestValidator,
  claim_history: claimHistoryRequestValidator,
  quick_protocol_facts: quickProtocolFactsRequestValidator,
  daily_tech_brief: dailyTechBriefRequestValidator,
  prediction_market_research: predictionMarketResearchRequestValidator,
  resolution_evidence_compiler: resolutionEvidenceCompilerRequestValidator,
};
