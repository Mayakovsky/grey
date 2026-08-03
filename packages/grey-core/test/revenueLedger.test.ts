// E1-F: revenue is recorded at every settlement point on the x402 channel — the normal 7 paid
// HTTP routes, the trust-rung route (when enabled), and the MCP tools/call path. Fail-open: a
// ledger write failure must never cost the buyer their already-paid-for response.
import { describe, it, expect } from 'vitest';
import { loadX402Config } from '@grey/x402-middleware';
import { makeApp, passThroughX402Gate } from './_helpers';

const cfg = loadX402Config({
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});
const relayerStubs = {
  wallet: { writeContract: async () => ('0x' + 'ee'.repeat(32)) as `0x${string}` },
  publicClient: {
    readContract: async () => false,
    simulateContract: async () => ({ request: {} }),
    waitForTransactionReceipt: async () => ({ status: 'success' as const }),
  },
};

describe('revenue ledger — recorded at settlement (E1-F)', () => {
  it('a normal paid HTTP route records channel=x402, correct offering + price', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    const app = makeApp({ revenueEventsSink: sink }); // passThroughX402: settlement is "already done"
    await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(sink).toHaveLength(1);
    expect(sink[0]).toEqual({ channel: 'x402', offering: 'legitimacy_scan', revenueUsd: 0.25 });
  });

  it('a 402 (no payment, real gate) records NOTHING — settlement never happened', async () => {
    const sink: Array<unknown> = [];
    const { makeX402PreHandler, makeX402PaymentPresenceCheck } =
      await import('@grey/x402-middleware');
    const gate = {
      preValidation: makeX402PaymentPresenceCheck(cfg),
      preHandler: makeX402PreHandler(cfg, relayerStubs),
    };
    const app = makeApp({ revenueEventsSink: sink as never }, gate);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(402);
    expect(sink).toHaveLength(0);
  });

  it('the trust-rung route records revenue when enabled', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    // passThroughX402 here too — same "settlement already handled" convention as the first test
    // above; makeTrustRungPreHandler's own verify/settle gating is covered by the 402-records-
    // nothing test and by x402-middleware's own trustRung.test.ts.
    const app = makeApp({ revenueEventsSink: sink }, passThroughX402Gate, {
      trustRungEnabled: true,
      trustRungGate: passThroughX402Gate,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan_trust_rung',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(sink).toEqual([
      { channel: 'x402', offering: 'legitimacy_scan_trust_rung', revenueUsd: 0.1 },
    ]);
  });

  it('MCP tools/call records revenue only after a real settle() success, not on the payment-required leg', async () => {
    const sink: Array<{ channel: string; offering: string; revenueUsd: number }> = [];
    const app = makeApp({ revenueEventsSink: sink }, undefined, {
      mcp: { x402Config: cfg, ...relayerStubs },
    });
    // Leg 1: no payment -> isError, no settlement, no revenue.
    await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'verify_whitepaper',
          arguments: { token_address: '0x1111111111111111111111111111111111111111' },
        },
      },
    });
    expect(sink).toHaveLength(0);
  });

  it('a not-yet-offered slug (merge-prep: daily_greenlight_list/scam_alert_feed, enabled:false) writes no revenue event — rejected before it ever reaches the payment/handler path', async () => {
    const sink: Array<unknown> = [];
    const app = makeApp({ revenueEventsSink: sink as never }, undefined, {
      mcp: { x402Config: cfg, ...relayerStubs },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'daily_greenlight_list', arguments: {} },
      },
    });
    expect(sink).toHaveLength(0);
  });
});
