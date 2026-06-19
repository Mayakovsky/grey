// legitimacy_scan (tier 1, cache-read-only). Cache hit → LegitimacyScanResponse from the row;
// miss → flat NOT_IN_DATABASE sentinel.
import type { OfferingHandler } from './types';
import type { RequestFor } from '@grey/schemas';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildLegitimacyHit } from '../orchestration/cacheRead';
import { cacheOrLive } from '../orchestration/cacheOrLive';

export const legitimacyScan: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { token_address?: string; project_name?: string };
  const wp = await resolveWhitepaper(deps.whitepapers, {
    tokenAddress: body.token_address,
    projectName: body.project_name,
  });
  const v = wp ? await deps.verifications.findByWhitepaperId(wp.id) : null;
  // Cache miss → live compute (§2.10). Cache hit → direct row→payload (MiCA guard intact).
  if (!wp || !v) {
    return cacheOrLive('legitimacy_scan', body as RequestFor<'legitimacy_scan'>, deps);
  }
  return { payload: buildLegitimacyHit(wp, v), subject: subjectFrom(wp, { tokenAddress: body.token_address ?? null, projectName: body.project_name }), cacheHit: true };
};
