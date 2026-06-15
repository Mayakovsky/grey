import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, claimRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const url = '/v1/offerings/verify_full_tech';

describe('verify_full_tech handler', () => {
  it('cache miss → NOT_IN_DATABASE + zeroed L3 fields', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'verify_full_tech');
    expect(body.payload.verdict).toBe('NOT_IN_DATABASE');
    expect(body.payload.confidenceScore).toBe(0);
    expect(body.payload.evaluations).toEqual([]);
    expect(body.payload.focusAreaScores).toEqual({});
    await app.close();
  });

  it('cache hit → confidenceScore + evaluations + focusAreaScores', async () => {
    const app = makeApp({
      whitepapersByToken: [whitepaperRow()],
      verification: verificationRow(),
      claims: [claimRow()],
    });
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'verify_full_tech');
    expect(body.payload.confidenceScore).toBe(82);
    expect((body.payload.evaluations as unknown[]).length).toBe(1);
    expect(body.payload.focusAreaScores).toEqual({ tokenomics: 4, performance: 3 });
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
