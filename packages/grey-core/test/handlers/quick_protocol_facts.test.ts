import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/offerings/quick_protocol_facts';

describe('quick_protocol_facts handler', () => {
  it('not in cache → NOT_IN_DATABASE', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { projectQuery: 'Nonexistent' } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'quick_protocol_facts');
    expect(body.payload.headlineVerdict).toBe('NOT_IN_DATABASE');
    expect(body.payload.lastVerified).toBeNull();
    await app.close();
  });

  it('cached verification → headlineVerdict + miCAStatus + lastVerified', async () => {
    const app = makeApp({ whitepapersByName: [whitepaperRow()], verification: verificationRow() });
    const res = await app.inject({ method: 'POST', url, payload: { projectQuery: 'Uniswap' } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'quick_protocol_facts');
    expect(body.payload.headlineVerdict).toBe('PASS');
    expect(body.payload.miCAStatus).toBe('YES');
    expect(typeof body.payload.lastVerified).toBe('string');
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
