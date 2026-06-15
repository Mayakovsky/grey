// verify_whitepaper (tier 2, cache-read-only). Hit → legitimacy + claims/claimScores/logicSummary.
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildVerifyWhitepaperHit, buildVerifyWhitepaperMiss } from '../orchestration/cacheRead';

export const verifyWhitepaper: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as {
    token_address?: string;
    project_name?: string;
    document_url?: string;
  };
  const fallback = { tokenAddress: body.token_address ?? null, projectName: body.project_name };
  const wp = await resolveWhitepaper(deps.whitepapers, {
    tokenAddress: body.token_address,
    projectName: body.project_name,
  });
  const subject = subjectFrom(wp, fallback);
  const v = wp ? await deps.verifications.findByWhitepaperId(wp.id) : null;
  if (!wp || !v) {
    return { payload: buildVerifyWhitepaperMiss(deps, fallback), subject, cacheHit: false };
  }
  const claims = await deps.claims.findByWhitepaperId(wp.id);
  return { payload: buildVerifyWhitepaperHit(wp, v, claims), subject, cacheHit: true };
};
