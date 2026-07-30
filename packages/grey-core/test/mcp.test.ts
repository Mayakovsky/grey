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

  it('tools/list projects the SAME EvaluationKit source as the HTTP surface — 9 tools, never the trust rung', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({ method: 'POST', url: '/v1/mcp', payload: rpc('tools/list') });
    const body = res.json();
    expect(body.result.tools).toHaveLength(9);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('legitimacy_scan');
    expect(names).not.toContain('legitimacy_scan_trust_rung');
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

describe('MCP — tools/call (E1-D)', () => {
  it('a free tool runs with no payment required', async () => {
    const app = makeApp({}, undefined, { mcp: mcpDeps });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      payload: rpc('tools/call', { name: 'scam_alert_feed', arguments: {} }),
    });
    const body = res.json();
    expect(body.result.isError).toBeFalsy();
    const envelope = JSON.parse(body.result.content[0].text);
    expect(envelope.offering).toBe('scam_alert_feed');
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
});
