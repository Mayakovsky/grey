// daily_tech_brief (DB aggregate read). Builds a full verify_full_tech payload per verification
// in the requested (or latest) daily batch. Empty DB → {date, totalVerified:0, whitepapers:[]}.
import type { OfferingHandler } from './types';
import { buildVerifyFullTechHit, iso } from '../orchestration/cacheRead';

export const dailyTechBrief: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { date?: string };
  const rows = body.date
    ? await deps.verifications.getVerificationsByDate(body.date)
    : await deps.verifications.getLatestDailyBatch();

  const whitepapers: Array<Record<string, unknown>> = [];
  for (const v of rows) {
    if ((v.totalClaims ?? 0) <= 0) continue;
    const wp = await deps.whitepapers.findById(v.whitepaperId);
    if (!wp) continue;
    const claims = await deps.claims.findByWhitepaperId(wp.id);
    whitepapers.push(buildVerifyFullTechHit(wp, v, claims));
  }

  const date = body.date ?? iso(deps.clock()).split('T')[0];
  return {
    payload: { date, totalVerified: whitepapers.length, whitepapers },
    subject: { tokenAddress: null, projectName: '' },
    cacheHit: whitepapers.length > 0,
  };
};
