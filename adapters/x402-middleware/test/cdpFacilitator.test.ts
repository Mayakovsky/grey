// CDP Facilitator Phase 2 — the parallel, additive verify/settle path via CDP's hosted
// facilitator instead of the local relayer. Mocks FacilitatorClient (verify/settle) so these run
// with zero network calls, same discipline as preHandler.test.ts's mockWallet/mockPublicClient.
import { describe, it, expect } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  cdpSlugFromUrl,
  makeCdpFacilitatorClient,
  verifyAndSettleViaCdp,
  makeCdpX402PaymentPresenceCheck,
  makeCdpX402PreHandler,
  type CdpX402PreHandlerDeps,
} from '../src/cdpFacilitator.js';
import type { FacilitatorClient } from '@x402/core/http';
import { VerifyError, SettleError } from '@x402/core/types';
import type { X402Config } from '../src/types.js';
import { TEST_CFG, signedPayment } from './_sign.js';

const CDP_CFG: X402Config = {
  ...TEST_CFG,
  cdp: { apiKeyId: 'test-key-id', apiKeySecret: 'test-key-secret' },
};

// Casts strip the `this: FastifyInstance` context Fastify's hook types carry (unused by these
// handlers) — same TS2684 workaround preHandler.test.ts's own `gate()` helper uses.
function presenceCheck(cfg: X402Config) {
  const h = makeCdpX402PaymentPresenceCheck(cfg);
  return h as unknown as (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}
function preHandlerGate(cfg: X402Config, deps: CdpX402PreHandlerDeps) {
  const h = makeCdpX402PreHandler(cfg, deps);
  return h as unknown as (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

interface MockReply {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  code(c: number): MockReply;
  send(b: unknown): MockReply;
  header(k: string, v: string): MockReply;
}

function reqReply(url: string, header?: string) {
  const reply: MockReply = {
    statusCode: 0,
    body: undefined,
    headers: {},
    code(c) {
      this.statusCode = c;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    header(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  const req = { url, headers: header ? { 'x-payment': header } : {} };
  return {
    req: req as unknown as FastifyRequest,
    reply: reply as unknown as FastifyReply,
    m: reply,
  };
}

function mockClient(overrides: Partial<FacilitatorClient> = {}): FacilitatorClient {
  return {
    verify: async () => ({ isValid: true }),
    settle: async () => ({
      success: true,
      transaction: '0x' + 'cd'.repeat(32),
      network: 'eip155:84532',
    }),
    getSupported: async () => ({ kinds: [], extensions: [], signers: {} }),
    ...overrides,
  };
}

describe('cdpSlugFromUrl', () => {
  it('extracts a paid slug from the /v1/cdp/offerings/ prefix', () => {
    expect(cdpSlugFromUrl('/v1/cdp/offerings/legitimacy_scan')).toBe('legitimacy_scan');
    expect(cdpSlugFromUrl('/v1/cdp/offerings/daily_tech_brief?x=1')).toBe('daily_tech_brief');
  });

  it('returns null for the primary (non-cdp) route prefix — the two route families are separate', () => {
    expect(cdpSlugFromUrl('/v1/offerings/legitimacy_scan')).toBeNull();
  });

  it('returns null for unknown slugs / other paths', () => {
    expect(cdpSlugFromUrl('/v1/cdp/offerings/not_a_slug')).toBeNull();
    expect(cdpSlugFromUrl('/v1/resources/scam_alert_feed')).toBeNull();
  });
});

describe('makeCdpFacilitatorClient — fail closed', () => {
  it('throws when cfg.cdp is null (CDP routing invoked without keys)', () => {
    expect(() => makeCdpFacilitatorClient(TEST_CFG)).toThrow(/CDP_API_KEY/);
  });

  it('builds a client (no throw) when cfg.cdp is set', () => {
    const client = makeCdpFacilitatorClient(CDP_CFG);
    expect(typeof client.verify).toBe('function');
    expect(typeof client.settle).toBe('function');
  });
});

describe('verifyAndSettleViaCdp', () => {
  const resource = '/v1/cdp/offerings/legitimacy_scan';

  async function decodedPayload() {
    const { payload } = await signedPayment(TEST_CFG);
    return payload;
  }

  it('verify().isValid === false -> clean {ok:false}, settle never called', async () => {
    const decoded = await decodedPayload();
    let settleCalled = false;
    const client = mockClient({
      verify: async () => ({ isValid: false, invalidReason: 'underpayment' }),
      settle: async () => {
        settleCalled = true;
        throw new Error('should not be called');
      },
    });
    const outcome = await verifyAndSettleViaCdp(
      CDP_CFG,
      client,
      'legitimacy_scan',
      resource,
      decoded,
    );
    expect(outcome).toEqual({ ok: false, reason: 'underpayment' });
    expect(settleCalled).toBe(false);
  });

  it('verify() throws VerifyError -> clean {ok:false} from its invalidReason', async () => {
    const decoded = await decodedPayload();
    const client = mockClient({
      verify: async () => {
        throw new VerifyError(402, { isValid: false, invalidReason: 'expired' });
      },
    });
    const outcome = await verifyAndSettleViaCdp(
      CDP_CFG,
      client,
      'legitimacy_scan',
      resource,
      decoded,
    );
    expect(outcome).toEqual({ ok: false, reason: 'expired' });
  });

  it('verify() throws a generic (non-VerifyError) error -> rethrows for the caller to classify as infra', async () => {
    const decoded = await decodedPayload();
    const client = mockClient({
      verify: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await expect(
      verifyAndSettleViaCdp(CDP_CFG, client, 'legitimacy_scan', resource, decoded),
    ).rejects.toThrow('ECONNRESET');
  });

  it('settle().success === false -> clean {ok:false}', async () => {
    const decoded = await decodedPayload();
    const client = mockClient({
      settle: async () => ({
        success: false,
        errorReason: 'insufficient_funds',
        transaction: '',
        network: 'eip155:84532',
      }),
    });
    const outcome = await verifyAndSettleViaCdp(
      CDP_CFG,
      client,
      'legitimacy_scan',
      resource,
      decoded,
    );
    expect(outcome).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('settle() throws SettleError -> clean {ok:false} from its errorReason', async () => {
    const decoded = await decodedPayload();
    const client = mockClient({
      settle: async () => {
        throw new SettleError(402, {
          success: false,
          errorReason: 'double_spend',
          transaction: '',
          network: 'eip155:84532',
        });
      },
    });
    const outcome = await verifyAndSettleViaCdp(
      CDP_CFG,
      client,
      'legitimacy_scan',
      resource,
      decoded,
    );
    expect(outcome).toEqual({ ok: false, reason: 'double_spend' });
  });

  it('settle() throws a generic error -> rethrows', async () => {
    const decoded = await decodedPayload();
    const client = mockClient({
      settle: async () => {
        throw new Error('timeout');
      },
    });
    await expect(
      verifyAndSettleViaCdp(CDP_CFG, client, 'legitimacy_scan', resource, decoded),
    ).rejects.toThrow('timeout');
  });

  it('verify + settle both succeed -> {ok:true, txHash}', async () => {
    const decoded = await decodedPayload();
    const client = mockClient();
    const outcome = await verifyAndSettleViaCdp(
      CDP_CFG,
      client,
      'legitimacy_scan',
      resource,
      decoded,
    );
    expect(outcome.ok).toBe(true);
    expect(outcome).toMatchObject({ ok: true, txHash: expect.stringMatching(/^0x/) });
  });
});

describe('makeCdpX402PaymentPresenceCheck', () => {
  it('402 + requirements when X-PAYMENT is absent, on the /v1/cdp/offerings/ route', async () => {
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan');
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(402);
    expect(
      (m.body as { accepts: { maxAmountRequired: string }[] }).accepts[0].maxAmountRequired,
    ).toBe('250000');
  });

  it('passes through (no-op) when X-PAYMENT is present', async () => {
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan', 'some-header');
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(0);
  });

  it('is a defensive no-op on a non-cdp-route URL', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(0);
  });
});

describe('makeCdpX402PreHandler — orchestration (mocked FacilitatorClient)', () => {
  it('402 + requirements when X-PAYMENT is absent', async () => {
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan');
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('402 on a malformed X-PAYMENT header (never reaches CDP)', async () => {
    let verifyCalled = false;
    const client = mockClient({
      verify: async () => {
        verifyCalled = true;
        return { isValid: true };
      },
    });
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan', 'not-base64-json!!');
    await preHandlerGate(CDP_CFG, { client })(req, reply);
    expect(m.statusCode).toBe(402);
    expect(verifyCalled).toBe(false);
  });

  it('settles + sets X-PAYMENT-RESPONSE on a CDP-verified + CDP-settled payment', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan', header);
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(0); // never sent -> handler runs
    expect(m.headers['X-PAYMENT-RESPONSE']).toBeDefined();
  });

  it('402 when CDP verify rejects', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan', header);
    const client = mockClient({
      verify: async () => ({ isValid: false, invalidReason: 'expired' }),
    });
    await preHandlerGate(CDP_CFG, { client })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('502 (generic error) when the CDP call fails for an infra reason, not a rejection', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/cdp/offerings/legitimacy_scan', header);
    const client = mockClient({
      verify: async () => {
        throw new Error('network unreachable');
      },
    });
    const logged: unknown[] = [];
    await preHandlerGate(CDP_CFG, {
      client,
      logger: { error: (msg, meta) => logged.push({ msg, meta }) },
    })(req, reply);
    expect(m.statusCode).toBe(502);
    expect((m.body as { error: string }).error).toBe('settlement failed'); // generic — no leaked detail
    expect(logged).toHaveLength(1); // detail goes to the logger, not the response body
  });

  it('is a defensive no-op on a non-cdp-route URL', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(0);
  });
});
