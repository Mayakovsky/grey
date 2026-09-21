// Bankr Bridge route tests — POST /v1/bridge/bankr/<slug>. No x402 gate on this path; auth is a
// static bearer secret (X-Grey-Bridge-Secret) compared constant-time. See
// BANKR-BRIDGE-BUILD-KOV-directive.md, BANKR-BRIDGE-EXPAND-OFFERINGS-KOV-directive.md, and
// src/server/routes/bankrBridge.ts.
import { describe, it, expect } from 'vitest';
import { makeApp, expectValidEnvelope } from '../_helpers';

const SECRET = 'test-bridge-secret-do-not-use-in-prod';
const URL = '/v1/bridge/bankr/legitimacy_scan';
const TOKEN = '0x1111111111111111111111111111111111111111';

describe('Bankr Bridge — POST /v1/bridge/bankr/legitimacy_scan', () => {
  it('404s when no bankrBridgeSecret is configured — the route does not exist', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: URL, payload: { token_address: TOKEN } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('403s with no X-Grey-Bridge-Secret header', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({ method: 'POST', url: URL, payload: { token_address: TOKEN } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('403s with a wrong X-Grey-Bridge-Secret header', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-grey-bridge-secret': 'wrong-secret' },
      payload: { token_address: TOKEN },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('403s with a wrong secret of a different length (exercises the length-mismatch branch)', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-grey-bridge-secret': 'short' },
      payload: { token_address: TOKEN },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('400s on a bad body even with the correct secret — schema validation still runs', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('200s with the correct secret + a valid body, returning the same envelope shape the PAID route produces', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload: { token_address: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expectValidEnvelope(body, 'legitimacy_scan');
    await app.close();
  });

  it('the primary /v1/offerings/legitimacy_scan route is unaffected either way', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      payload: { token_address: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('records a $0 bankr-bridge usage event, distinct from the real x402 revenue channel', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    const app = makeApp({ revenueEventsSink: sink }, undefined, { bankrBridgeSecret: SECRET });
    await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload: { token_address: TOKEN },
    });
    expect(sink).toEqual([{ channel: 'bankr-bridge', offering: 'legitimacy_scan', revenueUsd: 0 }]);
    await app.close();
  });
});

// BANKR-BRIDGE-EXPAND-OFFERINGS-KOV-directive.md: the 5 newly-added slugs, same 8-assertion
// coverage as legitimacy_scan above, parametrized rather than hand-copied — the route registration
// loop (bankrBridge.ts) is generic per slug, so the tests mirror that shape instead of duplicating
// prose 5x.
const NEW_SLUG_PAYLOADS: Record<string, object> = {
  verify_whitepaper: { token_address: TOKEN },
  verify_full_tech: { token_address: TOKEN },
  claim_extraction: { whitepaperUrl: 'https://uniswap.org/whitepaper.pdf' },
  claim_history: { projectIdentifier: 'Uniswap' },
  quick_protocol_facts: { projectQuery: 'Uniswap' },
};

describe.each(Object.keys(NEW_SLUG_PAYLOADS))('Bankr Bridge — POST /v1/bridge/bankr/%s', (slug) => {
  const url = `/v1/bridge/bankr/${slug}`;
  const payload = NEW_SLUG_PAYLOADS[slug];

  it('404s when no bankrBridgeSecret is configured — the route does not exist', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('403s with no X-Grey-Bridge-Secret header', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('403s with a wrong X-Grey-Bridge-Secret header', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-grey-bridge-secret': 'wrong-secret' },
      payload,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('403s with a wrong secret of a different length (exercises the length-mismatch branch)', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-grey-bridge-secret': 'short' },
      payload,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('400s on a bad body even with the correct secret — schema validation still runs', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('200s with the correct secret + a valid body, returning the same envelope shape the PAID route produces', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expectValidEnvelope(body, slug);
    await app.close();
  });

  it('the primary /v1/offerings/<slug> route is unaffected either way', async () => {
    const app = makeApp({}, undefined, { bankrBridgeSecret: SECRET });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/offerings/${slug}`,
      payload,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('records a $0 bankr-bridge usage event, distinct from the real x402 revenue channel', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    const app = makeApp({ revenueEventsSink: sink }, undefined, { bankrBridgeSecret: SECRET });
    await app.inject({
      method: 'POST',
      url,
      headers: { 'x-grey-bridge-secret': SECRET },
      payload,
    });
    expect(sink).toEqual([{ channel: 'bankr-bridge', offering: slug, revenueUsd: 0 }]);
    await app.close();
  });
});
