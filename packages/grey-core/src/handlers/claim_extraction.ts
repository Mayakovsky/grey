// claim_extraction (cache-read-only). Its request is a `whitepaperUrl` only, and there is no
// repo lookup by URL in the exported pipeline surface — so in M3 it is ALWAYS a miss and returns
// the typed-empty ClaimExtractionResponse. The live URL→whitepaper resolution + L1+L2 extraction
// is deferred to M3.5 (see PHASE-C-PROGRESS / FDQ-1).
import type { OfferingHandler } from './types';

export const claimExtraction: OfferingHandler = async (_input, _deps) => ({
  payload: { whitepaper: {}, structuralAnalysis: {}, claims: [], tokenAddress: null },
  subject: { tokenAddress: null, projectName: '' },
  cacheHit: false,
});
