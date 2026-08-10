// prediction_market_research (e3-b2, Olas Mech Marketplace / Base). CACHE_ONLY. No
// cache-population pipeline for prediction-market content exists yet (scoping call, e3-b2) — this
// always returns NOT_YET_ANALYSED, same shape as legitimacy_scan_trust_rung shipping
// built-but-empty. Deliberately does NOT touch deps.whitepapers/verifications/claims — those are
// the whitepaper-verification content domain, unrelated to prediction markets.
import type { OfferingHandler } from './types';

export const predictionMarketResearch: OfferingHandler = async (input) => {
  const body = (input.requirement ?? {}) as { marketQuery?: string };
  const marketQuery = body.marketQuery ?? '';

  return {
    payload: {
      market: { query: marketQuery },
      status: 'NOT_YET_ANALYSED',
      analysis: null,
      lastAnalysed: null,
      note: 'No cache-population pipeline for prediction-market content yet (e3-b2 scope).',
    },
    subject: { tokenAddress: null, projectName: marketQuery },
    cacheHit: false,
  };
};
