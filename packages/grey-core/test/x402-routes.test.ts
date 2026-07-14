// Route-level integration: the real x402 gate installed on the 7 paid POST routes (was: no-op
// pass-through). Asserts 402-without-payment + requirements shape through Fastify, malformed →
// clean 402 (never 500), and the free GET resources are ungated. The valid-payment→settle→200
// path is unit-covered in @grey/x402-middleware's preHandler.test + the anvil integration.
import { describe, it, expect } from 'vitest';
import { loadX402Config, makeX402PreHandler } from '@grey/x402-middleware';
import { makeApp } from './_helpers';

const cfg = loadX402Config({
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});

// Mock clients — never reached on the no-payment paths (402 precedes settle).
const gate = makeX402PreHandler(cfg, {
  wallet: { writeContract: async () => ('0x' + 'ee'.repeat(32)) as `0x${string}` },
  publicClient: {
    readContract: async () => false,
    simulateContract: async () => ({ request: {} }),
    waitForTransactionReceipt: async () => ({ status: 'success' as const }),
  },
  now: () => 1_000_000_000_000,
});

const PRICE: Record<string, string> = {
  legitimacy_scan: '250000',
  verify_whitepaper: '1500000',
  verify_full_tech: '3000000',
  claim_extraction: '750000',
  claim_history: '250000',
  quick_protocol_facts: '300000',
  daily_tech_brief: '8000000',
};

const TOKEN = '0x1111111111111111111111111111111111111111';

// A schema-valid body per offering, so request validation (which runs BEFORE the preHandler)
// passes and the request actually reaches the x402 gate.
const PAYLOAD: Record<string, object> = {
  legitimacy_scan: { token_address: TOKEN },
  verify_whitepaper: { token_address: TOKEN },
  verify_full_tech: { token_address: TOKEN },
  claim_extraction: { whitepaperUrl: 'https://uniswap.org/whitepaper.pdf' },
  claim_history: { projectIdentifier: 'Uniswap' },
  quick_protocol_facts: { projectQuery: 'Uniswap' },
  daily_tech_brief: {},
};

describe('x402 gate on the 7 paid routes', () => {
  it.each(Object.keys(PRICE))(
    'POST /v1/offerings/%s without payment → 402 + exact-scheme requirements',
    async (slug) => {
      const app = makeApp({}, gate);
      const res = await app.inject({
        method: 'POST',
        url: `/v1/offerings/${slug}`,
        payload: PAYLOAD[slug],
      });
      expect(res.statusCode).toBe(402);
      const body = res.json();
      expect(body.x402Version).toBe(1);
      expect(body.accepts[0].scheme).toBe('exact');
      expect(body.accepts[0].network).toBe('eip155:84532');
      expect(body.accepts[0].maxAmountRequired).toBe(PRICE[slug]);
      expect(body.accepts[0].payTo).toBe(cfg.payTo);
      expect(body.accepts[0].asset).toBe(cfg.usdc.address);
      await app.close();
    },
  );

  it('malformed X-PAYMENT → clean 402, never 500', async () => {
    const app = makeApp({}, gate);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      headers: { 'x-payment': 'not-base64-json!!' },
      payload: { token_address: TOKEN },
    });
    expect(res.statusCode).toBe(402);
    await app.close();
  });

  it('free resource GETs are NOT gated (200 without payment)', async () => {
    const app = makeApp({}, gate);
    const res = await app.inject({ method: 'GET', url: '/v1/resources/scam_alert_feed' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
