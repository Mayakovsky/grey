// @grey/schemas/responses/types — offering slug taxonomy + the compile-time ResponseFor<O>
// type map (Q6). Type-only, no runtime. j-s-t-t cannot model the envelope's allOf[if/then]
// discrimination (generated `payload` is `{}`), so grey-core's narrowEnvelope<O> helper
// bridges runtime (offeringValidators[slug]) + compile-time (ResponseFor<O>).
//
// Import paths are PascalCase per scripts/codegen.ts NAME_MAP (FDQ-6) — each maps to the
// schema-generated *Response type (NOT the pipeline domain *Report types in src/index.ts).

import type { LegitimacyScanResponse } from '../generated/v1/LegitimacyScanResponse';
import type { VerifyWhitepaperResponse } from '../generated/v1/VerifyWhitepaperResponse';
import type { VerifyFullTechResponse } from '../generated/v1/VerifyFullTechResponse';
import type { ClaimExtractionResponse } from '../generated/v1/ClaimExtractionResponse';
import type { ClaimHistoryResponse } from '../generated/v1/ClaimHistoryResponse';
import type { QuickProtocolFactsResponse } from '../generated/v1/QuickProtocolFactsResponse';
import type { DailyTechBriefResponse } from '../generated/v1/DailyTechBriefResponse';
import type { DailyGreenlightListResponse } from '../generated/v1/DailyGreenlightListResponse';
import type { ScamAlertFeedResponse } from '../generated/v1/ScamAlertFeedResponse';

/** All 9 ratified offering slugs (canonical, matches the `offering` discriminator + validators map). */
export type OfferingSlug =
  | 'legitimacy_scan'
  | 'verify_whitepaper'
  | 'verify_full_tech'
  | 'claim_extraction'
  | 'claim_history'
  | 'quick_protocol_facts'
  | 'daily_tech_brief'
  | 'daily_greenlight_list'
  | 'scam_alert_feed';

/** The 7 paid offerings (request-body-bearing). Excludes the 2 free GET resources (FDQ-10). */
export type PaidOfferingSlug = Exclude<OfferingSlug, 'daily_greenlight_list' | 'scam_alert_feed'>;

/** Maps an offering slug to its schema-generated response payload type. */
export type ResponseFor<O extends OfferingSlug> = O extends 'legitimacy_scan'
  ? LegitimacyScanResponse
  : O extends 'verify_whitepaper'
    ? VerifyWhitepaperResponse
    : O extends 'verify_full_tech'
      ? VerifyFullTechResponse
      : O extends 'claim_extraction'
        ? ClaimExtractionResponse
        : O extends 'claim_history'
          ? ClaimHistoryResponse
          : O extends 'quick_protocol_facts'
            ? QuickProtocolFactsResponse
            : O extends 'daily_tech_brief'
              ? DailyTechBriefResponse
              : O extends 'daily_greenlight_list'
                ? DailyGreenlightListResponse
                : O extends 'scam_alert_feed'
                  ? ScamAlertFeedResponse
                  : never;
