// legitimacy_scan (tier 1, cache-read-only). Cache hit → LegitimacyScanResponse from the row;
// miss → flat NOT_IN_DATABASE sentinel.
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildLegitimacyHit, buildLegitimacyMiss } from '../orchestration/cacheRead';

export const legitimacyScan: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { token_address?: string; project_name?: string };
  const fallback = { tokenAddress: body.token_address ?? null, projectName: body.project_name };
  const wp = await resolveWhitepaper(deps.whitepapers, {
    tokenAddress: body.token_address,
    projectName: body.project_name,
  });
  const subject = subjectFrom(wp, fallback);
  const v = wp ? await deps.verifications.findByWhitepaperId(wp.id) : null;
  if (!wp || !v) {
    return { payload: buildLegitimacyMiss(deps, fallback), subject, cacheHit: false };
  }
  return { payload: buildLegitimacyHit(wp, v), subject, cacheHit: true };
};
