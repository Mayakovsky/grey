// GET /v1/discovery/services (+/:slug) — the Bazaar discovery index (E1-B). Free, ungated.
import { describe, it, expect } from 'vitest';
import { makeApp } from './_helpers';

describe('discovery routes — Bazaar index (E1-B, Invariant #33)', () => {
  it('GET /v1/discovery/services lists all 9 offerings, discoverable and free (no x402 gate)', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/discovery/services' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { services: Array<{ slug: string; discoverable: boolean }> };
    expect(body.services).toHaveLength(9);
    expect(body.services.every((s) => s.discoverable)).toBe(true);
    expect(body.services.map((s) => s.slug)).toContain('legitimacy_scan');
  });

  it('GET /v1/discovery/services/:slug returns the full evaluation artifact, incl. a sample (E1-C)', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/discovery/services/verify_whitepaper',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe('verify_whitepaper');
    expect(body.priceUsd).toBe(1.5);
    expect(body.computeClass).toBe('LIVE_ALLOWED');
    expect(body.inputSchema).toBeTruthy();
    expect(body.outputSchema).toBeTruthy();
    expect(body.sample).toBeTruthy();
    expect(body.sample.request).toBeTruthy();
    expect(body.sample.response).toBeTruthy();
  });

  it('the list route stays lean — no sample attached', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/discovery/services' });
    const body = res.json() as { services: Array<{ sample?: unknown }> };
    expect(body.services.every((s) => s.sample === undefined)).toBe(true);
  });

  it('GET /v1/discovery/services/:slug 404s for an unknown or unregistered slug', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/discovery/services/nope' });
    expect(res.statusCode).toBe(404);
  });
});
