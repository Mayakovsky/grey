// verify_full_tech (tier 3, cache-read-only). Hit → verify_whitepaper + L3 (confidence,
// evaluations, focusAreaScores, tokens, cost).
import type { OfferingHandler } from './types';
import type { RequestFor } from '@grey/schemas';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildVerifyFullTechHit } from '../orchestration/cacheRead';
import { cacheOrLive } from '../orchestration/cacheOrLive';

export const verifyFullTech: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as {
    token_address?: string;
    project_name?: string;
    document_url?: string;
  };
  const wp = await resolveWhitepaper(deps.whitepapers, {
    tokenAddress: body.token_address,
    projectName: body.project_name,
  });
  const v = wp ? await deps.verifications.findByWhitepaperId(wp.id) : null;
  if (!wp || !v) {
    return cacheOrLive('verify_full_tech', body as RequestFor<'verify_full_tech'>, deps);
  }
  const claims = await deps.claims.findByWhitepaperId(wp.id);
  return {
    payload: buildVerifyFullTechHit(wp, v, claims),
    subject: subjectFrom(wp, { tokenAddress: body.token_address ?? null, projectName: body.project_name }),
    cacheHit: true,
  };
};
