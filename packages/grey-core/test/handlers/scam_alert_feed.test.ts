import { describe, it, expect } from 'vitest';
import { makeApp, whitepaperRow, verificationRow, expectValidEnvelope, type EnvBody } from '../_helpers';

const url = '/v1/resources/scam_alert_feed';

describe('scam_alert_feed handler (free GET)', () => {
  it('empty DB → empty flagged list', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'scam_alert_feed');
    expect(body.payload.flagged).toEqual([]);
    await app.close();
  });

  it('FAIL + high hype rows → flagged with redFlags', async () => {
    const app = makeApp({
      scamAlerts: [verificationRow({ verdict: 'FAIL', hypeTechRatio: 5.0, structuralScore: 1, totalClaims: 0 })],
      whitepaperById: whitepaperRow(),
    });
    const res = await app.inject({ method: 'GET', url });
    const body = res.json() as EnvBody;
    expectValidEnvelope(body, 'scam_alert_feed');
    const flagged = body.payload.flagged as Array<{ redFlags: string[] }>;
    expect(flagged.length).toBe(1);
    expect(flagged[0].redFlags.length).toBeGreaterThan(0);
    expect(body.metadata.cacheHit).toBe(true);
    await app.close();
  });
});
