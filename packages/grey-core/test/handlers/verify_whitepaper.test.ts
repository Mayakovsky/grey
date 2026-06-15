import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, claimRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const url = '/v1/offerings/verify_whitepaper';

describe('verify_whitepaper handler', () => {
  it('cache miss → NOT_IN_DATABASE + empty claims', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'verify_whitepaper');
    expect(body.payload.verdict).toBe('NOT_IN_DATABASE');
    expect(body.payload.claims).toEqual([]);
    expect(body.metadata.cacheHit).toBe(false);
    await app.close();
  });

  it('cache hit → claims + claimScores + logicSummary', async () => {
    const app = makeApp({
      whitepapersByToken: [whitepaperRow()],
      verification: verificationRow(),
      claims: [claimRow(), claimRow({ id: 'c-2', category: 'PERFORMANCE' })],
    });
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'verify_whitepaper');
    expect((body.payload.claims as unknown[]).length).toBe(2);
    expect(body.payload.claimCount).toBe(2);
    expect(typeof body.payload.logicSummary).toBe('string');
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
