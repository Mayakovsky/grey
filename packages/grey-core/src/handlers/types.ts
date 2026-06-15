// @grey/core handler types. Ingress-agnostic OfferingHandler (mirrors plugin-acp's production
// OfferingHandler so the M5 ACP adapter reuses it). Row type aliases are DERIVED from the
// pipeline repo method return types — no dependency on whether the Row types are exported.
import type { HandlerDeps } from '../deps';
import type { EnvelopeSubject } from '../envelope/build';

export type WhitepaperRow = NonNullable<Awaited<ReturnType<HandlerDeps['whitepapers']['findById']>>>;
export type VerificationRow = NonNullable<Awaited<ReturnType<HandlerDeps['verifications']['findByWhitepaperId']>>>;
export type ClaimRow = Awaited<ReturnType<HandlerDeps['claims']['findByWhitepaperId']>>[number];

export interface HandlerInput {
  jobId?: string;
  offeringId: string;
  buyerAddress?: string;
  /** The request body, already validated upstream by the route's offeringRequestValidator. */
  requirement: unknown;
  isPlainText?: boolean;
  rawContent?: string;
}

/**
 * Handler result. Carries the payload (route wraps it in the envelope), the resolved envelope
 * subject (the cache-read already does the whitepaper lookup subject-mapping needs, so it's
 * returned here rather than re-resolved in the route), and cacheHit for the envelope metadata.
 * (Internal grey-core contract; the spec's "payload only" §3 Q2 is refined to avoid a double
 * DB lookup — see PHASE-C-PROGRESS.)
 */
export interface HandlerResult {
  payload: unknown;
  subject: EnvelopeSubject;
  cacheHit: boolean;
}

export type OfferingHandler = (input: HandlerInput, deps: HandlerDeps) => Promise<HandlerResult>;
