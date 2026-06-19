// verify_whitepaper (tier 2, cache-read-only). Hit → legitimacy + claims/claimScores/logicSummary.
import type { OfferingHandler } from './types';
import type { RequestFor } from '@grey/schemas';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { buildVerifyWhitepaperHit } from '../orchestration/cacheRead';
import { cacheOrLive } from '../orchestration/cacheOrLive';

export const verifyWhitepaper: OfferingHandler = async (input, deps) => {
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
    return cacheOrLive('verify_whitepaper', body as RequestFor<'verify_whitepaper'>, deps);
  }
  const claims = await deps.claims.findByWhitepaperId(wp.id);
  return {
    payload: buildVerifyWhitepaperHit(wp, v, claims),
    subject: subjectFrom(wp, { tokenAddress: body.token_address ?? null, projectName: body.project_name }),
    cacheHit: true,
  };
};
