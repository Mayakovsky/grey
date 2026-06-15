// verify_full_tech (tier 3, cache-read-only). Hit → verify_whitepaper + L3 (confidence,
// evaluations, focusAreaScores, tokens, cost).
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildVerifyFullTechHit, buildVerifyFullTechMiss } from '../orchestration/cacheRead';

export const verifyFullTech: OfferingHandler = async (input, deps) => {
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
    return { payload: buildVerifyFullTechMiss(deps, fallback), subject, cacheHit: false };
  }
  const claims = await deps.claims.findByWhitepaperId(wp.id);
  return { payload: buildVerifyFullTechHit(wp, v, claims), subject, cacheHit: true };
};
