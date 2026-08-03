// POST /v1/mcp (E1-D) — hand-rolled JSON-RPC MCP surface over the same x402 rail.
import { describe, it, expect } from 'vitest';
import { loadX402Config } from '@grey/x402-middleware';
import { makeApp } from './_helpers';

const cfg = loadX402Config({
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});
const mcpDeps = {
  x402Config: cfg,
  wallet: { writeContract: async () => ('0x' + 'ee'.repeat(32)) as `0x${string}` },
  publicClient: {
    readContract: async () => false,
    simulateContract: async () => ({ request: {} }),
    waitForTransactionReceipt: async () => ({ status: 'success' as const }),
  },
};

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: '2.0' as const, id, method, params };
}

describe('MCP — initialize + tools/list (E1-D)', () => {
  it('initialize returns server info + tools capability', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({ method: 'POST', url: '/v1/mcp', payload: rpc('initialize') });
    const body = res.json();
    expect(body.result.protocolVersion).toBeTruthy();
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('tools/list projects the SAME EvaluationKit source as the HTTP surface — 7 tools: never the trust rung, never a not-yet-offered offering', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({ method: 'POST', url: '/v1/mcp', payload: rpc('tools/list') });
    const body = res.json();
    expect(body.result.tools).toHaveLength(7);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('legitimacy_scan');
    expect(names).not.toContain('legitimacy_scan_trust_rung');
    expect(names).not.toContain('daily_greenlight_list'); // merge-prep: not-yet-offered
    expect(names).not.toContain('scam_alert_feed'); // merge-prep: not-yet-offered
    const legit = body.result.tools.find((t: { name: string }) => t.name === 'legitimacy_scan');
    expect(legit.inputSchema).toBeTruthy();
    expect(typeof legit.description).toBe('string');
  });

  it('unknown method returns a JSON-RPC error', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({ method: 'POST', url: '/v1/mcp', payload: rpc('nope') });
    const body = res.json();
    expect(body.error.code).toBe(-32601);
  });
});

// Note: mcp.ts's `isFree` branch (skip payment for a FREE-list tool) has no live coverage via
// tools/call right now — both FREE offerings (daily_greenlight_list, scam_alert_feed) are
// enabled:false (merge-prep ruling) and are therefore excluded from MCP_TOOL_SLUGS entirely (see
// the not-yet-offered test below). If a future offering ships free+enabled, add a tools/call
// happy-path test against that slug here.
describe('MCP — tools/call (E1-D)', () => {
  it('merge-prep ruling: not-yet-offered offerings cannot be called by name, same as the trust rung', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    for (const name of ['daily_greenlight_list', 'scam_alert_feed']) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/mcp',
        payload: rpc('tools/call', { name, arguments: {} }),
      });
      const body = res.json();
      expect(body.error, name).toBeDefined();
      expect(body.error.code, name).toBe(-32602);
      expect(body.result, name).toBeUndefined();
    }
  });

  it('a paid tool without payment returns isError:true carrying PaymentRequirements', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', {
        name: 'legitimacy_scan',
        arguments: { token_address: '0x1111111111111111111111111111111111111111' },
      }),
    });
    const body = res.json();
    expect(body.result.isError).toBe(true);
    const requirements = JSON.parse(body.result.content[0].text);
    expect(requirements.accepts[0].maxAmountRequired).toBe('250000');
  });

  it('an unknown tool name is a JSON-RPC error, not a CallToolResult', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', { name: 'not_a_real_offering', arguments: {} }),
    });
    const body = res.json();
    expect(body.error.code).toBe(-32602);
  });

  it('the trust rung cannot be called by name even directly — MCP respects B-1 too (Invariant #34)', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', {
        name: 'legitimacy_scan_trust_rung',
        arguments: { token_address: '0x1111111111111111111111111111111111111111' },
      }),
    });
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.result).toBeUndefined();
  });

  it('a paid tool call with a payment header but malformed arguments -> clean isError, no settlement (nothing broadcast)', async () => {
    // Same "nothing broadcast" proof pattern as preHandler.test.ts's FDQ-40 test — a genuinely
    // signed payment isn't needed here: validation runs BEFORE decode/verify/settle now, so any
    // non-empty header is enough to get past the presence check and reach the new validation
    // step, and wallet.calls staying empty proves settle() was never reached either way.
    const calls: unknown[] = [];
    const deps = {
      ...mcpDeps,
      wallet: {
        writeContract: async (args: unknown) => {
          calls.push(args);
          return ('0x' + 'ee'.repeat(32)) as `0x${string}`;
        },
      },
    };
    const app = makeApp({}, undefined, { mcp: deps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', {
        name: 'legitimacy_scan',
        arguments: {}, // missing required token_address
        _meta: { x402Payment: 'present-but-not-necessarily-valid' },
      }),
    });
    const body = res.json();
    expect(body.result.isError).toBe(true);
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.error).toContain('token_address');
    expect(calls).toHaveLength(0); // settle() never reached — nothing broadcast
  });

  it('malformed arguments with no payment header at all still returns PaymentRequirements first (presence check wins, same precedence as the HTTP route)', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', { name: 'legitimacy_scan', arguments: {} }),
    });
    const body = res.json();
    expect(body.result.isError).toBe(true);
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.accepts).toBeDefined(); // PaymentRequirements shape, not a validation-error shape
  });
});
