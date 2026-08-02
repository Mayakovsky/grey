// @grey/schemas/evaluationKit — the reusable metadata projection (E1-B, spec §3 E1 bequeaths,
// Invariant #33). Every channel listing (Bazaar, Kite, Olas, MCP, ...) renders from this single
// source — no hand-authored per-platform metadata.
import type { OfferingSlug } from '../responses/types';

/** Hand-authored ONCE per offering (this satisfies Invariant #33 — "no hand-authored
 *  PER-PLATFORM metadata" means don't re-author per channel, not that this data has no author). */
export interface EvaluationKitBranding {
  readonly serviceName: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly iconUrl: string;
}

/** One sample request/response pair — the evaluation-friction answer (spec §0.2): a buying agent
 *  can inspect real shape + a real output before it ever pays. */
export interface SampleExchange {
  readonly request: unknown;
  readonly response: unknown;
}

/** A field that failed a Bazaar validation rule and was soft-dropped (spec E1-B: "soft-drop means
 *  a bad field vanishes silently" — surfaced here so tests/logs can see it instead of it truly
 *  vanishing without a trace). */
export interface DroppedField {
  readonly field: string;
  readonly reason: string;
}

/** The projected Bazaar extension shape for one offering (spec E1-B field list, verbatim). */
export interface EvaluationKitEntry {
  readonly slug: OfferingSlug;
  readonly discoverable: boolean;
  readonly serviceName: string | null;
  readonly tags: readonly string[];
  readonly description: string;
  readonly inputSchema: object | null;
  readonly outputSchema: object;
  readonly iconUrl: string | null;
  readonly priceUsd: number | null;
  readonly computeClass: string;
  readonly sample?: SampleExchange;
  /** Fields that failed validation and were dropped from this entry (soft-drop, not a throw). */
  readonly dropped: readonly DroppedField[];
}
