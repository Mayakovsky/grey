// @grey/core handler registry — OfferingSlug → OfferingHandler. All 9 are cache-read-only (M3).
import type { OfferingSlug } from '@grey/schemas/responses';
import type { OfferingHandler } from './types';
import { legitimacyScan } from './legitimacy_scan';
import { verifyWhitepaper } from './verify_whitepaper';
import { verifyFullTech } from './verify_full_tech';
import { claimExtraction } from './claim_extraction';
import { claimHistory } from './claim_history';
import { quickProtocolFacts } from './quick_protocol_facts';
import { dailyTechBrief } from './daily_tech_brief';
import { dailyGreenlightList } from './daily_greenlight_list';
import { scamAlertFeed } from './scam_alert_feed';

export const offeringHandlers: Record<OfferingSlug, OfferingHandler> = {
  legitimacy_scan: legitimacyScan,
  verify_whitepaper: verifyWhitepaper,
  verify_full_tech: verifyFullTech,
  claim_extraction: claimExtraction,
  claim_history: claimHistory,
  quick_protocol_facts: quickProtocolFacts,
  daily_tech_brief: dailyTechBrief,
  daily_greenlight_list: dailyGreenlightList,
  scam_alert_feed: scamAlertFeed,
};
