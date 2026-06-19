import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const url = '/v1/offerings/legitimacy_scan';

describe('legitimacy_scan handler', () => {
  it('cache miss → live discovery-miss → INSUFFICIENT_DATA envelope (§20)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'legitimacy_scan');
    expect(body.payload.verdict).toBe('INSUFFICIENT_DATA');
    expect(body.metadata.cacheHit).toBe(false);
    await app.close();
  });

  it('cache hit → cached report envelope', async () => {
    const app = makeApp({ whitepapersByToken: [whitepaperRow()], verification: verificationRow() });
    const res = await app.inject({ method: 'POST', url, payload: { token_address: TOKEN } });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'legitimacy_scan');
    expect(body.payload.verdict).toBe('PASS');
    expect(body.payload.discoveryStatus).toBe('cached');
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });

  it('rejects an invalid request body (missing token_address)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload: { project_name: 'X' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
