import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/resources/daily_greenlight_list';

describe('daily_greenlight_list handler (free GET)', () => {
  it('empty DB → empty projects', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'daily_greenlight_list');
    expect(body.payload.totalVerified).toBe(0);
    expect(body.payload.projects).toEqual([]);
    await app.close();
  });

  it('PASS rows → greenlit projects', async () => {
    const app = makeApp({
      greenlight: [verificationRow({ verdict: 'PASS' })],
      whitepaperById: whitepaperRow(),
    });
    const res = await app.inject({ method: 'GET', url });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'daily_greenlight_list');
    expect(body.payload.totalVerified).toBe(1);
    expect((body.payload.projects as unknown[]).length).toBe(1);
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
