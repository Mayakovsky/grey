// @grey/schemas/validators — ajv-compiled runtime validators (value-only barrel).
// One validator per offering payload + the full envelope. All schemas are added to a
// single Ajv2020 instance so cross-file $refs (responses -> _shared, envelope -> responses)
// resolve by $id. M3 selects the per-offering validator by `offering` slug, and validates
// the full wire response with envelopeValidator.
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import sharedSchema from '../responses/v1/_shared.schema.json';
import legitimacyScanSchema from '../responses/v1/legitimacy_scan.schema.json';
import verifyWhitepaperSchema from '../responses/v1/verify_whitepaper.schema.json';
import verifyFullTechSchema from '../responses/v1/verify_full_tech.schema.json';
import claimExtractionSchema from '../responses/v1/claim_extraction.schema.json';
import claimHistorySchema from '../responses/v1/claim_history.schema.json';
import quickProtocolFactsSchema from '../responses/v1/quick_protocol_facts.schema.json';
import dailyTechBriefSchema from '../responses/v1/daily_tech_brief.schema.json';
import dailyGreenlightListSchema from '../responses/v1/daily_greenlight_list.schema.json';
import scamAlertFeedSchema from '../responses/v1/scam_alert_feed.schema.json';
import envelopeSchema from '../responses/v1/envelope.schema.json';

const BASE = 'https://schemas.whitepapergrey.com/v1/';
const id = (file: string): string => `${BASE}${file}`;

export const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

// _shared is referenced but never validated directly; the rest are addSchema'd so every
// cross-ref resolves before any compile (getSchema compiles lazily against the added set).
ajv.addSchema([
  sharedSchema,
  legitimacyScanSchema,
  verifyWhitepaperSchema,
  verifyFullTechSchema,
  claimExtractionSchema,
  claimHistorySchema,
  quickProtocolFactsSchema,
  dailyTechBriefSchema,
  dailyGreenlightListSchema,
  scamAlertFeedSchema,
  envelopeSchema,
]);

function compiled(file: string): ValidateFunction {
  const v = ajv.getSchema(id(file));
  if (!v) throw new Error(`@grey/schemas/validators: no compiled schema for ${file}`);
  return v;
}

// Per-offering payload validators (validate the inner response shape).
export const legitimacyScanValidator = compiled('legitimacy_scan.schema.json');
export const verifyWhitepaperValidator = compiled('verify_whitepaper.schema.json');
export const verifyFullTechValidator = compiled('verify_full_tech.schema.json');
export const claimExtractionValidator = compiled('claim_extraction.schema.json');
export const claimHistoryValidator = compiled('claim_history.schema.json');
export const quickProtocolFactsValidator = compiled('quick_protocol_facts.schema.json');
export const dailyTechBriefValidator = compiled('daily_tech_brief.schema.json');
export const dailyGreenlightListValidator = compiled('daily_greenlight_list.schema.json');
export const scamAlertFeedValidator = compiled('scam_alert_feed.schema.json');

// Full-envelope validator (validates wrapper + payload-XOR-error + if/then payload binding).
export const envelopeValidator = compiled('envelope.schema.json');

/** Per-offering validator lookup by canonical slug. */
export const offeringValidators: Record<string, ValidateFunction> = {
  legitimacy_scan: legitimacyScanValidator,
  verify_whitepaper: verifyWhitepaperValidator,
  verify_full_tech: verifyFullTechValidator,
  claim_extraction: claimExtractionValidator,
  claim_history: claimHistoryValidator,
  quick_protocol_facts: quickProtocolFactsValidator,
  daily_tech_brief: dailyTechBriefValidator,
  daily_greenlight_list: dailyGreenlightListValidator,
  scam_alert_feed: scamAlertFeedValidator,
};
