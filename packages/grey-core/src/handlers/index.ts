// @grey/core handler registry — OfferingSlug → OfferingHandler. All 10 are cache-read-only at
// this layer (M3); 4 delegate to cacheOrLive on a cache miss (M3.5). `legitimacy_scan_trust_rung`
// (E1-C) is here because the HANDLER is harmless to have registered — it never reaches live
// compute either way — but it must NOT be reachable on any route/channel unless
// @grey/x402-middleware's trustRungEnabled() is true. Route mounting (grey-core/src/server) and
// discovery listing both check that flag explicitly; this registry does not gate anything itself.
import type { OfferingSlug } from '@grey/schemas/responses';
import type { OfferingHandler } from './types';
import { legitimacyScan } from './legitimacy_scan';
import { legitimacyScanTrustRung } from './legitimacy_scan_trust_rung';
import { verifyWhitepaper } from './verify_whitepaper';
import { verifyFullTech } from './verify_full_tech';
import { claimExtraction } from './claim_extraction';
import { claimHistory } from './claim_history';
import { quickProtocolFacts } from './quick_protocol_facts';
import { dailyTechBrief } from './daily_tech_brief';
import { dailyGreenlightList } from './daily_greenlight_list';
import { scamAlertFeed } from './scam_alert_feed';
import { predictionMarketResearch } from './prediction_market_research';
import { resolutionEvidenceCompiler } from './resolution_evidence_compiler';

export const offeringHandlers: Record<OfferingSlug, OfferingHandler> = {
  legitimacy_scan: legitimacyScan,
  legitimacy_scan_trust_rung: legitimacyScanTrustRung,
  verify_whitepaper: verifyWhitepaper,
  verify_full_tech: verifyFullTech,
  claim_extraction: claimExtraction,
  claim_history: claimHistory,
  quick_protocol_facts: quickProtocolFacts,
  daily_tech_brief: dailyTechBrief,
  daily_greenlight_list: dailyGreenlightList,
  scam_alert_feed: scamAlertFeed,
  prediction_market_research: predictionMarketResearch,
  resolution_evidence_compiler: resolutionEvidenceCompiler,
};
