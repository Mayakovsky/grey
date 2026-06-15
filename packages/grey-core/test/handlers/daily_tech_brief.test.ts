import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, claimRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/offerings/daily_tech_brief';

describe('daily_tech_brief handler', () => {
  it('empty DB → totalVerified 0, empty whitepapers', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: {} });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'daily_tech_brief');
    expect(body.payload.totalVerified).toBe(0);
    expect(body.payload.whitepapers).toEqual([]);
    await app.close();
  });

  it('latest batch → full-tech entries', async () => {
    const app = makeApp({
      latestBatch: [verificationRow()],
      whitepaperById: whitepaperRow(),
      claims: [claimRow()],
    });
    const res = await app.inject({ method: 'POST', url, payload: {} });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'daily_tech_brief');
    expect(body.payload.totalVerified).toBe(1);
    expect((body.payload.whitepapers as unknown[]).length).toBe(1);
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
