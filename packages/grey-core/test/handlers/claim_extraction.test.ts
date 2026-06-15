import { describe, it, expect } from 'vitest';
import { makeApp, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/offerings/claim_extraction';

describe('claim_extraction handler (always typed-empty in M3)', () => {
  it('returns the typed-empty envelope (no URL cache lookup in M3)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { whitepaperUrl: 'https://uniswap.org/whitepaper.pdf' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'claim_extraction');
    expect(body.payload.claims).toEqual([]);
    expect(body.payload.tokenAddress).toBeNull();
    expect(body.metadata.cacheHit).toBe(false);
    await app.close();
  });

  it('rejects an invalid request body (missing whitepaperUrl)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
