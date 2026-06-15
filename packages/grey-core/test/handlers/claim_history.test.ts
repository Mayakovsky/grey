import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, claimRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/offerings/claim_history';

describe('claim_history handler', () => {
  it('no match → empty history envelope', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { projectIdentifier: 'Nonexistent' } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'claim_history');
    expect(body.payload.verifications).toEqual([]);
    expect(body.payload.claims).toEqual([]);
    expect(body.metadata.cacheHit).toBe(false);
    await app.close();
  });

  it('match → verifications + claims', async () => {
    const app = makeApp({
      whitepapersByName: [whitepaperRow()],
      verification: verificationRow(),
      claims: [claimRow()],
    });
    const res = await app.inject({ method: 'POST', url, payload: { projectIdentifier: 'Uniswap' } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'claim_history');
    expect((body.payload.verifications as unknown[]).length).toBe(1);
    expect((body.payload.claims as unknown[]).length).toBe(1);
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });

  it('rejects an invalid request body (missing projectIdentifier)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { token_address: '0xabc' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
