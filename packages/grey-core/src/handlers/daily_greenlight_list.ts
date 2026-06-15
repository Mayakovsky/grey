// daily_greenlight_list (free; DB read). PASS verdicts verified today. Empty DB → empty projects.
import type { OfferingHandler } from './types';
import { iso } from '../orchestration/cacheRead';

export const dailyGreenlightList: OfferingHandler = async (_input, deps) => {
  const rows = await deps.verifications.getGreenlightList();
  const projects: Array<Record<string, unknown>> = [];
  for (const v of rows) {
    const wp = await deps.whitepapers.findById(v.whitepaperId);
    projects.push({
      name: wp?.projectName ?? 'Unknown',
      tokenAddress: wp?.tokenAddress ?? null,
      verdict: 'PASS',
      score: v.confidenceScore ?? 0,
      hypeTechRatio: v.hypeTechRatio ?? 0,
    });
  }
  return {
    payload: { date: iso(deps.clock()).split('T')[0], totalVerified: projects.length, projects },
    subject: { tokenAddress: null, projectName: '' },
    cacheHit: projects.length > 0,
  };
};
