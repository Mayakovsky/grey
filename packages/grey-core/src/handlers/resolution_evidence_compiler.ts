// resolution_evidence_compiler (e3-b2, Olas Mech Marketplace / Base). CACHE_ONLY. Same
// built-but-empty shape as prediction_market_research — no evidence-compilation pipeline exists
// yet (e3-b2 scope). Deliberately does NOT touch deps.whitepapers/verifications/claims.
import type { OfferingHandler } from './types';

export const resolutionEvidenceCompiler: OfferingHandler = async (input) => {
  const body = (input.requirement ?? {}) as { marketQuery?: string };
  const marketQuery = body.marketQuery ?? '';

  return {
    payload: {
      market: { query: marketQuery },
      status: 'NOT_YET_ANALYSED',
      evidence: [],
      compiledAt: null,
      note: 'No evidence-compilation pipeline yet (e3-b2 scope).',
    },
    subject: { tokenAddress: null, projectName: marketQuery },
    cacheHit: false,
  };
};
