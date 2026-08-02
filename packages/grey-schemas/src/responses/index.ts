// @grey/schemas/responses — generated TS types for the 9 offering responses + envelope
// + shared $defs. Type-only barrel (`export type` under verbatimModuleSyntax: true).
//
// Named re-exports of each file's main type (NOT `export type *`): json-schema-to-typescript
// inlines referenced $defs into every generated file (e.g. VerifyFullTechResponse.d.ts
// re-declares LegitimacyScanResponse/DiscoveryAttempt), so a wildcard re-export across files
// would collide on the shared names. The shared $def types come from `_shared` once.
export type { LegitimacyScanResponse } from '../generated/v1/LegitimacyScanResponse';
export type { LegitimacyScanTrustRungResponse } from '../generated/v1/LegitimacyScanTrustRungResponse';
export type { VerifyWhitepaperResponse } from '../generated/v1/VerifyWhitepaperResponse';
export type { VerifyFullTechResponse } from '../generated/v1/VerifyFullTechResponse';
export type { ClaimExtractionResponse } from '../generated/v1/ClaimExtractionResponse';
export type { ClaimHistoryResponse } from '../generated/v1/ClaimHistoryResponse';
export type { QuickProtocolFactsResponse } from '../generated/v1/QuickProtocolFactsResponse';
export type { DailyTechBriefResponse } from '../generated/v1/DailyTechBriefResponse';
export type { DailyGreenlightListResponse } from '../generated/v1/DailyGreenlightListResponse';
export type { ScamAlertFeedResponse } from '../generated/v1/ScamAlertFeedResponse';
export type { GreyResponseEnvelope } from '../generated/v1/GreyResponseEnvelope';
export type * from '../generated/v1/_shared';

// M3 (Q6/FDQ-9): offering slug taxonomy + ResponseFor<O> type map (type-only; verbatimModuleSyntax).
export type * from './types';
