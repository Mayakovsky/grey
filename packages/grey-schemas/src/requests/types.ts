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

export interface LegitimacyScanRequest {
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
