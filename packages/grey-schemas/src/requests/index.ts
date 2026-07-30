// @grey/schemas/requests — request-layer barrel. Canonical hand-authored request types
// (the handler-facing shapes) + the request validators map. Type-only re-exports use
// `export type` (verbatimModuleSyntax: true, Invariant 7); named (not `export type *`) per
// Pattern 6 convention, though request schemas have no shared $defs so no inlining collision.
export type {
  LegitimacyScanRequest,
  LegitimacyScanTrustRungRequest,
  VerifyWhitepaperRequest,
  VerifyFullTechRequest,
  DailyTechBriefRequest,
  ClaimHistoryRequest,
  QuickProtocolFactsRequest,
  ClaimExtractionRequest,
  // M3.5 (FDQ-1): additive request-side taxonomy + map
  ComputeOfferingSlug,
  RequestFor,
} from './types';

export { offeringRequestValidators } from '../validators';
