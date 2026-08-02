// legitimacy_scan_trust_rung (E1-C, $0.10 CACHE_ONLY — BUILT BUT BLOCKED per Forces ruling B-1).
// Cache-read only, structurally: this offering is not in ComputeOfferingSlug, so it is not
// callable into cacheOrLive at the type level (Invariant #30's compile-time half); there is no
// live branch here to accidentally take, unlike legitimacy_scan.ts's cache-miss → cacheOrLive
// call. A cache miss returns the flat NOT_IN_DATABASE-style sentinel, same as every other
// CACHE_ONLY offering — it never "retries live", paid or not.
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildTrustRungHit, buildTrustRungMiss } from '../orchestration/cacheRead';

export const legitimacyScanTrustRung: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { token_address?: string; project_name?: string };
  const wp = await resolveWhitepaper(deps.whitepapers, {
    tokenAddress: body.token_address,
    projectName: body.project_name,
  });
  const v = wp ? await deps.verifications.findByWhitepaperId(wp.id) : null;
  const fallback = { tokenAddress: body.token_address ?? null, projectName: body.project_name };
  if (!wp || !v) {
    return {
      payload: buildTrustRungMiss(deps, fallback),
      subject: subjectFrom(null, fallback),
      cacheHit: false,
    };
  }
  return { payload: buildTrustRungHit(wp, v), subject: subjectFrom(wp, fallback), cacheHit: true };
};
