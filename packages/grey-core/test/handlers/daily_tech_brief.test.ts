// BION-DIRECTIVE-62: daily_tech_brief is held back entirely (no live route on any channel) — the
// HTTP route this test used to hit no longer exists (see x402-routes.test.ts's own 404 coverage).
// The handler itself stays registered (offeringHandlers.daily_tech_brief) — real, working code,
// needed for discovery's enumeration and any future re-enable — so this now calls it directly,
// same shape any handler test would use without a live route to go through.
import { describe, it, expect } from 'vitest';
import { offeringHandlers } from '../../src/handlers';
import { fakeDeps, whitepaperRow, verificationRow, claimRow } from '../_helpers';

interface DailyTechBriefPayload {
  totalVerified: number;
  whitepapers: unknown[];
}

describe('daily_tech_brief handler', () => {
  it('empty DB → totalVerified 0, empty whitepapers', async () => {
    const deps = fakeDeps();
    const result = await offeringHandlers.daily_tech_brief(
      { offeringId: 'daily_tech_brief', requirement: {} },
      deps,
    );
    const payload = result.payload as DailyTechBriefPayload;
    expect(payload.totalVerified).toBe(0);
    expect(payload.whitepapers).toEqual([]);
    expect(result.cacheHit).toBe(false);
  });

  it('latest batch → full-tech entries', async () => {
    const deps = fakeDeps({
      latestBatch: [verificationRow()],
      whitepaperById: whitepaperRow(),
      claims: [claimRow()],
    });
    const result = await offeringHandlers.daily_tech_brief(
      { offeringId: 'daily_tech_brief', requirement: {} },
      deps,
    );
    const payload = result.payload as DailyTechBriefPayload;
    expect(payload.totalVerified).toBe(1);
    expect(payload.whitepapers.length).toBe(1);
    expect(result.cacheHit).toBe(true);
  });
});
