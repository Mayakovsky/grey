// CDP Facilitator Phase 2: /v1/cdp/offerings/<slug> is a PARALLEL, additive route family —
// mounted only when a cdpGate is supplied (mirrors trust rung's conditional-mount pattern), and
// must never interfere with the primary /v1/offerings/<slug> routes or their revenue channel.
import { describe, it, expect } from 'vitest';
import { makeApp, passThroughX402Gate } from './_helpers';

describe('CDP-routed offerings — /v1/cdp/offerings/<slug> (Phase 2)', () => {
  it('404s when no cdpGate is configured — the route family does not exist', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cdp/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('the primary /v1/offerings/<slug> route is unaffected either way (still 200 via pass-through)', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('mounts and runs once a cdpGate is provided — proves the route genuinely exists', async () => {
    const app = makeApp({}, passThroughX402Gate, { cdpGate: passThroughX402Gate });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cdp/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(200); // pass-through gate -> settlement "already done", handler runs
    await app.close();
  });

  it('records revenue under channel "x402-cdp", distinct from the primary rail\'s "x402"', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    const app = makeApp({ revenueEventsSink: sink }, passThroughX402Gate, {
      cdpGate: passThroughX402Gate,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/cdp/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(sink).toEqual([{ channel: 'x402-cdp', offering: 'legitimacy_scan', revenueUsd: 0.25 }]);
    await app.close();
  });
});
