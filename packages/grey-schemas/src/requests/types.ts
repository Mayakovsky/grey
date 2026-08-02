// @grey/schemas/requests — hand-authored canonical request interfaces (the handler-facing
// types) AND the Pattern 4b drift sentinel. Field names mirror src/requests/v1/*.schema.json
// (ground-truthed from plugin-wpv AgentCardConfig.ts inputSchema, M3 FDQ-2).
//
// These are the canonical request types consumed downstream (re-exported via ./index.ts).
// The codegen also emits src/generated/v1/requests/*.d.ts from the same schemas (committed +
// drift-checked by CI); those are a schema-well-formedness artifact, not re-exported. The
// Pattern 4b mirror test (test/request-field-drift.test.ts) asserts these interfaces' keys
// stay in lockstep with each schema's `properties` — so a schema edit that isn't mirrored
// here (or vice versa) fails the test/typecheck.
//
// 7 paid offerings only (FDQ-10): the 2 free GETs (daily_greenlight_list, scam_alert_feed)
// take no request body and are exempt from request validation + Pattern 4b.

import type { PaidOfferingSlug } from '../responses/types';

export interface LegitimacyScanRequest {
  token_address: string;
  project_name?: string;
}

/** E1-C trust rung — same identifier shape as legitimacy_scan. BUILT BUT BLOCKED (see
 *  @grey/x402-middleware's trustRung.ts); this type existing does not mean the route is live. */
export interface LegitimacyScanTrustRungRequest {
  token_address: string;
  project_name?: string;
}

export interface VerifyWhitepaperRequest {
  token_address: string;
  project_name?: string;
  document_url?: string;
}

export interface VerifyFullTechRequest {
  token_address: string;
  project_name?: string;
  document_url?: string;
}

export interface DailyTechBriefRequest {
  date?: string;
}

export interface ClaimHistoryRequest {
  projectIdentifier: string;
}

export interface QuickProtocolFactsRequest {
  projectQuery: string;
}

export interface ClaimExtractionRequest {
  whitepaperUrl: string;
}

// ── M3.5 (FDQ-1): ComputeOfferingSlug + RequestFor<O> (additive; mirrors ResponseFor<O>) ──
//
// The 4 offerings whose cache-miss runs live-compute in M3.5 (the cache-or-live tier). Subset of
// PaidOfferingSlug; the other 3 paid offerings (claim_history / quick_protocol_facts /
// daily_tech_brief) are pure-DB-read and never invoke a pipeline variant. Authored as an explicit
// union per the spec; a compile-time subset guard in test/request-type-map.test.ts keeps it ⊆
// PaidOfferingSlug. No change to OfferingSlug / PaidOfferingSlug.

export type ComputeOfferingSlug =
  | 'legitimacy_scan'
  | 'verify_whitepaper'
  | 'verify_full_tech'
  | 'claim_extraction';

/** Maps a paid offering slug to its hand-authored request interface (the cacheOrLive input seam). */
export type RequestFor<O extends PaidOfferingSlug> = O extends 'legitimacy_scan'
  ? LegitimacyScanRequest
  : O extends 'legitimacy_scan_trust_rung'
    ? LegitimacyScanTrustRungRequest
    : O extends 'verify_whitepaper'
    ? VerifyWhitepaperRequest
    : O extends 'verify_full_tech'
      ? VerifyFullTechRequest
      : O extends 'claim_extraction'
        ? ClaimExtractionRequest
        : O extends 'claim_history'
          ? ClaimHistoryRequest
          : O extends 'quick_protocol_facts'
            ? QuickProtocolFactsRequest
            : O extends 'daily_tech_brief'
              ? DailyTechBriefRequest
              : never;
