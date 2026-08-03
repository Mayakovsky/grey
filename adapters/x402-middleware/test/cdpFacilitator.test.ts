// CDP Facilitator Phase 2 — the parallel, additive verify/settle path via CDP's hosted
// facilitator instead of the local relayer. Mocks FacilitatorClient (verify/settle) so these run
// with zero network calls, same discipline as preHandler.test.ts's mockWallet/mockPublicClient.
//
// v2-shaped challenge revision: this route's wire format is x402 protocol v2 throughout —
// PAYMENT-REQUIRED/PAYMENT-RESPONSE response headers (empty JSON body) and PAYMENT-SIGNATURE as
// the buyer's request header (not X-PAYMENT, that's v1-only) — see cdpFacilitator.ts's header
// comment for why. Tests build real v2-shaped payloads (genuine EIP-3009 signatures via
// signedPayment, wrapped in the v2 envelope) rather than reusing Grey's v1 X-PAYMENT shape.
import { describe, it, expect } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  cdpSlugFromUrl,
  makeCdpFacilitatorClient,
  buildCdpPaymentRequirementsEntry,
  buildCdpChallenge,
  verifyAndSettleViaCdp,
  makeCdpX402PaymentPresenceCheck,
  makeCdpX402PreHandler,
  type CdpX402PreHandlerDeps,
} from '../src/cdpFacilitator.js';
import type { FacilitatorClient } from '@x402/core/http';
import {
  VerifyError,
  SettleError,
  type PaymentPayload as CdpPaymentPayload,
} from '@x402/core/types';
import type { X402Config } from '../src/types.js';
import { TEST_CFG, signedPayment } from './_sign.js';

const CDP_CFG: X402Config = {
  ...TEST_CFG,
  cdp: { apiKeyId: 'test-key-id', apiKeySecret: 'test-key-secret' },
};
const RESOURCE = '/v1/cdp/offerings/legitimacy_scan';

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
  // v2's request header is PAYMENT-SIGNATURE, not X-PAYMENT — this local reqReply is a copy
  // scoped to this file's own tests; preHandler.test.ts's separate copy correctly stays on
  // x-payment for the primary (v1) route.
  const req = { url, headers: header ? { 'payment-signature': header } : {} };
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

/** A genuine, cryptographically-signed EIP-3009 authorization (via signedPayment's real viem
 *  signing), wrapped in the v2 envelope this route now expects. */
async function v2Payload(
  cfg: X402Config,
  slug: string,
  resourceUrl: string,
  overrides?: Parameters<typeof signedPayment>[1],
): Promise<CdpPaymentPayload> {
  const { payload: v1 } = await signedPayment(cfg, overrides);
  return {
    x402Version: 2,
    resource: { url: resourceUrl },
    accepted: buildCdpPaymentRequirementsEntry(cfg, slug),
    payload: { signature: v1.payload.signature, authorization: v1.payload.authorization },
  };
}
function encodeHeader(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}
function decodeHeader<T>(header: string): T {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as T;
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

describe('buildCdpChallenge — v2-shaped PaymentRequired', () => {
  it('is x402Version 2 with a single, correctly-priced accepts[] entry', () => {
    const challenge = buildCdpChallenge(TEST_CFG, 'legitimacy_scan', RESOURCE);
    expect(challenge.x402Version).toBe(2);
    expect(challenge.resource.url).toBe(RESOURCE);
    expect(challenge.accepts).toHaveLength(1);
    expect(challenge.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: TEST_CFG.network,
      asset: TEST_CFG.usdc.address,
      amount: '250000',
      payTo: TEST_CFG.payTo,
      maxTimeoutSeconds: TEST_CFG.maxTimeoutSeconds,
    });
    expect(challenge.accepts[0].extra.credentialTypes).toEqual(['authorization']);
  });

  it('carries the Bazaar discovery extension (same EvaluationKit source as the primary route)', () => {
    const challenge = buildCdpChallenge(TEST_CFG, 'legitimacy_scan', RESOURCE);
    const bazaar = (challenge.extensions as { bazaar?: { info?: unknown; schema?: unknown } })
      ?.bazaar;
    expect(bazaar?.info).toBeTruthy();
    expect(bazaar?.schema).toBeTruthy();
  });

  it('sets body.error when passed', () => {
    const challenge = buildCdpChallenge(TEST_CFG, 'legitimacy_scan', RESOURCE, 'payment required');
    expect(challenge.error).toBe('payment required');
  });
});

describe('verifyAndSettleViaCdp — mechanical verify+settle over an already-v2 payload', () => {
  async function payload() {
    return v2Payload(CDP_CFG, 'legitimacy_scan', RESOURCE);
  }
  const requirements = buildCdpPaymentRequirementsEntry(CDP_CFG, 'legitimacy_scan');

  it('verify().isValid === false -> clean {ok:false}, settle never called', async () => {
    let settleCalled = false;
    const client = mockClient({
      verify: async () => ({ isValid: false, invalidReason: 'underpayment' }),
      settle: async () => {
        settleCalled = true;
        throw new Error('should not be called');
      },
    });
    const outcome = await verifyAndSettleViaCdp(client, requirements, await payload());
    expect(outcome).toEqual({ ok: false, reason: 'underpayment' });
    expect(settleCalled).toBe(false);
  });

  it('verify() throws VerifyError -> clean {ok:false} from its invalidReason', async () => {
    const client = mockClient({
      verify: async () => {
        throw new VerifyError(402, { isValid: false, invalidReason: 'expired' });
      },
    });
    const outcome = await verifyAndSettleViaCdp(client, requirements, await payload());
    expect(outcome).toEqual({ ok: false, reason: 'expired' });
  });

  it('verify() throws a generic (non-VerifyError) error -> rethrows for the caller to classify as infra', async () => {
    const client = mockClient({
      verify: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await expect(verifyAndSettleViaCdp(client, requirements, await payload())).rejects.toThrow(
      'ECONNRESET',
    );
  });

  it('settle().success === false -> clean {ok:false}', async () => {
    const client = mockClient({
      settle: async () => ({
        success: false,
        errorReason: 'insufficient_funds',
        transaction: '',
        network: 'eip155:84532',
      }),
    });
    const outcome = await verifyAndSettleViaCdp(client, requirements, await payload());
    expect(outcome).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('settle() throws SettleError -> clean {ok:false} from its errorReason', async () => {
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
    const outcome = await verifyAndSettleViaCdp(client, requirements, await payload());
    expect(outcome).toEqual({ ok: false, reason: 'double_spend' });
  });

  it('settle() throws a generic error -> rethrows', async () => {
    const client = mockClient({
      settle: async () => {
        throw new Error('timeout');
      },
    });
    await expect(verifyAndSettleViaCdp(client, requirements, await payload())).rejects.toThrow(
      'timeout',
    );
  });

  it('verify + settle both succeed -> {ok:true, txHash}', async () => {
    const client = mockClient();
    const outcome = await verifyAndSettleViaCdp(client, requirements, await payload());
    expect(outcome.ok).toBe(true);
    expect(outcome).toMatchObject({ ok: true, txHash: expect.stringMatching(/^0x/) });
  });
});

describe('makeCdpX402PaymentPresenceCheck — v2 challenge', () => {
  it('402 + empty body + PAYMENT-REQUIRED header when PAYMENT-SIGNATURE is absent', async () => {
    const { req, reply, m } = reqReply(RESOURCE);
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(402);
    expect(m.body).toEqual({});
    expect(m.headers['PAYMENT-REQUIRED']).toBeDefined();
    const decoded = decodeHeader<{ x402Version: number; accepts: { amount: string }[] }>(
      m.headers['PAYMENT-REQUIRED'],
    );
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].amount).toBe('250000');
  });

  it('passes through (no-op) when PAYMENT-SIGNATURE is present', async () => {
    const { req, reply, m } = reqReply(RESOURCE, 'some-header');
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(0);
  });

  it('is a defensive no-op on a non-cdp-route URL', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await presenceCheck(TEST_CFG)(req, reply);
    expect(m.statusCode).toBe(0);
  });
});

describe('makeCdpX402PreHandler — orchestration (mocked FacilitatorClient), v2 wire format', () => {
  it('402 + empty body + PAYMENT-REQUIRED header when PAYMENT-SIGNATURE is absent', async () => {
    const { req, reply, m } = reqReply(RESOURCE);
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(402);
    expect(m.body).toEqual({});
    expect(m.headers['PAYMENT-REQUIRED']).toBeDefined();
  });

  it('402 on a malformed PAYMENT-SIGNATURE header (never reaches CDP)', async () => {
    let verifyCalled = false;
    const client = mockClient({
      verify: async () => {
        verifyCalled = true;
        return { isValid: true };
      },
    });
    const { req, reply, m } = reqReply(RESOURCE, 'not-base64-json!!');
    await preHandlerGate(CDP_CFG, { client })(req, reply);
    expect(m.statusCode).toBe(402);
    expect(verifyCalled).toBe(false);
  });

  it('402 on a well-formed but v1-shaped PAYMENT-SIGNATURE (this route only accepts v2-native payloads)', async () => {
    const { header } = await signedPayment(TEST_CFG); // Grey's own v1 shape
    const { req, reply, m } = reqReply(RESOURCE, header);
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('settles + sets PAYMENT-RESPONSE (v2 header, not X-PAYMENT-RESPONSE) on a CDP-verified + CDP-settled payment', async () => {
    const header = encodeHeader(await v2Payload(TEST_CFG, 'legitimacy_scan', RESOURCE));
    const { req, reply, m } = reqReply(RESOURCE, header);
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(0); // never sent -> handler runs
    expect(m.headers['PAYMENT-RESPONSE']).toBeDefined();
    expect(m.headers['X-PAYMENT-RESPONSE']).toBeUndefined();
    const decoded = decodeHeader<{ success: boolean; transaction: string }>(
      m.headers['PAYMENT-RESPONSE'],
    );
    expect(decoded.success).toBe(true);
    expect(decoded.transaction).toMatch(/^0x/);
  });

  it('402 when CDP verify rejects', async () => {
    const header = encodeHeader(await v2Payload(TEST_CFG, 'legitimacy_scan', RESOURCE));
    const { req, reply, m } = reqReply(RESOURCE, header);
    const client = mockClient({
      verify: async () => ({ isValid: false, invalidReason: 'expired' }),
    });
    await preHandlerGate(CDP_CFG, { client })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('502 (generic error) when the CDP call fails for an infra reason, not a rejection', async () => {
    const header = encodeHeader(await v2Payload(TEST_CFG, 'legitimacy_scan', RESOURCE));
    const { req, reply, m } = reqReply(RESOURCE, header);
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
    expect((m.body as { x402Version: number; error: string }).x402Version).toBe(2);
    expect((m.body as { error: string }).error).toBe('settlement failed'); // generic — no leaked detail
    expect(logged).toHaveLength(1); // detail goes to the logger, not the response body
  });

  it('is a defensive no-op on a non-cdp-route URL', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await preHandlerGate(CDP_CFG, { client: mockClient() })(req, reply);
    expect(m.statusCode).toBe(0);
  });
});
