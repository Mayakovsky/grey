import { describe, it, expect } from 'vitest';
import { makeApp, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/offerings/claim_extraction';

describe('claim_extraction handler (M3.5 live via cacheOrLive)', () => {
  it('returns a valid envelope on the live path (bare pipeline stub → typed-empty miss sentinel)', async () => {
    // claim_extraction now always runs live (no URL cache lookup, Q5). With the bare pipeline stub
    // the run variant cannot acquire text, so cacheOrLive's failure path returns the typed-empty
    // sentinel — a valid ClaimExtractionResponse. (Happy-path live coverage is in cacheOrLive.test.ts.)
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
