// @grey/core projection — Map→Record at the stage→route boundary (Q5).
// Pipeline stage outputs include Map<string, number> (e.g. evaluateClaims scores); JSON
// envelopes need Record. Per FDQ-1, M3 is cache-read-only so this helper is likely invoked
// zero times in M3's actual code paths — it exists as the architectural seam for the deferred
// live-compute path (M3.5). The unit test exercises it independently.

/** Convert a Map to a plain JSON-serializable Record. */
export function mapToRecord<V>(m: Map<string, V>): Record<string, V> {
  return Object.fromEntries(m) as Record<string, V>;
}
