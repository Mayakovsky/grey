import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  makeX402PreHandler,
  makeX402PaymentPresenceCheck,
  slugFromUrl,
} from '../src/preHandler.js';
import { TEST_CFG, signedPayment, mockPublicClient, mockWallet } from './_sign.js';

// now() returns ms; 1e12 ms → 1e9 s, inside the default [0, 9_999_999_999) window.
const now = () => 1_000_000_000_000;

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

// Cast to a plain 2-arg callable — the Fastify hook type carries a `this: FastifyInstance`
// context this handler never uses, so a direct call would trip TS2684.
function gate(clients: {
  wallet: ReturnType<typeof mockWallet>;
  publicClient: ReturnType<typeof mockPublicClient>;
}) {
  const h = makeX402PreHandler(TEST_CFG, {
    wallet: clients.wallet,
    publicClient: clients.publicClient,
    now,
  });
  return h as unknown as (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

describe('slugFromUrl', () => {
  it('extracts a paid slug', () => {
    expect(slugFromUrl('/v1/offerings/legitimacy_scan')).toBe('legitimacy_scan');
    expect(slugFromUrl('/v1/offerings/daily_tech_brief?x=1')).toBe('daily_tech_brief');
  });
  it('returns null for non-paid / unknown', () => {
    expect(slugFromUrl('/v1/resources/scam_alert_feed')).toBeNull();
    expect(slugFromUrl('/v1/offerings/not_a_slug')).toBeNull();
  });

  it('merge-prep Task 2 check: not-yet-offered offerings can never reach a 402/buildPaymentRequirements body — they are mounted (if at all) at /v1/resources/*, which x402PreHandler never gates, and even under /v1/offerings/* would resolve to no slug (isPaidSlug false)', () => {
    for (const slug of ['daily_greenlight_list', 'scam_alert_feed']) {
      expect(slugFromUrl(`/v1/resources/${slug}`), slug).toBeNull();
      expect(slugFromUrl(`/v1/offerings/${slug}`), slug).toBeNull();
    }
  });
});

describe('makeX402PreHandler — orchestration', () => {
  it('402 + requirements when X-PAYMENT is absent', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient() })(req, reply);
    expect(m.statusCode).toBe(402);
    expect(
      (m.body as { accepts: { maxAmountRequired: string }[] }).accepts[0].maxAmountRequired,
    ).toBe('250000');
  });

  it('402 on a malformed header', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', 'garbage!!');
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient() })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('402 on a verify failure (underpayment)', async () => {
    const { header } = await signedPayment(TEST_CFG, { value: 1n });
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', header);
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient({ used: false }) })(
      req,
      reply,
    );
    expect(m.statusCode).toBe(402);
    expect((m.body as { error: string }).error).toBe('underpayment');
  });

  it('settles + sets X-PAYMENT-RESPONSE + lets the handler proceed on a valid payment', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', header);
    await gate({
      wallet: mockWallet('0x' + 'ee'.repeat(32)),
      publicClient: mockPublicClient({ used: false, status: 'success' }),
    })(req, reply);
    expect(m.statusCode).toBe(0); // never sent → handler runs
    const encoded = m.headers['X-PAYMENT-RESPONSE'];
    expect(encoded).toBeDefined();
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    expect(decoded).toMatchObject({ success: true, network: 'eip155:84532' });
    expect(decoded.transaction).toMatch(/^0x/);
  });

  it('502 (no handler) when settlement reverts', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', header);
    await gate({
      wallet: mockWallet(),
      publicClient: mockPublicClient({ used: false, status: 'reverted' }),
    })(req, reply);
    expect(m.statusCode).toBe(502);
    expect(m.headers['X-PAYMENT-RESPONSE']).toBeUndefined();
  });

  it('FDQ-40: 402 + zero broadcast when simulation reverts (replayed/spent nonce)', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', header);
    const wallet = mockWallet();
    await gate({ wallet, publicClient: mockPublicClient({ used: false, simRevert: true }) })(
      req,
      reply,
    );
    expect(m.statusCode).toBe(402); // clean 402, not a 502 after a wasted reverted tx
    expect(wallet.calls).toHaveLength(0); // nothing broadcast → zero relayer gas
    expect(m.headers['X-PAYMENT-RESPONSE']).toBeUndefined();
  });
});

// CDP/Bazaar alignment Phase 1 revision: proves the split hook pair's actual contract through a
// real Fastify instance (schema validation included) — a unit test calling makeX402PreHandler
// directly, like the tests above, can't exercise "does schema validation run first" at all, since
// there's no schema validation happening outside of Fastify's own request lifecycle.
describe('preValidation + preHandler split (CDP/Bazaar Phase 1 revision)', () => {
  const BODY_SCHEMA = {
    type: 'object',
    required: ['token_address'],
    properties: { token_address: { type: 'string' } },
  };

  it('valid X-PAYMENT + malformed body → 400, not 402/200, and zero broadcast (settlement never runs)', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const wallet = mockWallet();
    const app = Fastify();
    app.post(
      '/v1/offerings/legitimacy_scan',
      {
        schema: { body: BODY_SCHEMA },
        preValidation: makeX402PaymentPresenceCheck(TEST_CFG),
        preHandler: makeX402PreHandler(TEST_CFG, {
          wallet,
          publicClient: mockPublicClient({ used: false, status: 'success' }),
          now,
        }),
      },
      async () => ({ ok: true }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      headers: { 'x-payment': header }, // a genuinely valid, verifiable payment
      payload: {}, // missing required token_address → fails schema validation
    });

    expect(res.statusCode).toBe(400);
    expect(wallet.calls).toHaveLength(0); // settle() never ran — schema validation blocked it first
    await app.close();
  });

  it('no X-PAYMENT + malformed body → 402 with requirements, before schema validation ever runs', async () => {
    const app = Fastify();
    app.post(
      '/v1/offerings/legitimacy_scan',
      {
        schema: { body: BODY_SCHEMA },
        preValidation: makeX402PaymentPresenceCheck(TEST_CFG),
        preHandler: makeX402PreHandler(TEST_CFG, {
          wallet: mockWallet(),
          publicClient: mockPublicClient(),
          now,
        }),
      },
      async () => ({ ok: true }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      payload: {}, // would also fail schema, but preValidation's 402 must win the race
    });

    expect(res.statusCode).toBe(402);
    expect(
      (res.json() as { accepts: { maxAmountRequired: string }[] }).accepts[0].maxAmountRequired,
    ).toBe('250000');
    await app.close();
  });

  it('valid X-PAYMENT + valid body → settles and reaches the handler, same as before the split', async () => {
    const { header } = await signedPayment(TEST_CFG);
    const wallet = mockWallet('0x' + 'ee'.repeat(32));
    const app = Fastify();
    app.post(
      '/v1/offerings/legitimacy_scan',
      {
        schema: { body: BODY_SCHEMA },
        preValidation: makeX402PaymentPresenceCheck(TEST_CFG),
        preHandler: makeX402PreHandler(TEST_CFG, {
          wallet,
          publicClient: mockPublicClient({ used: false, status: 'success' }),
          now,
        }),
      },
      async () => ({ ok: true }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan',
      headers: { 'x-payment': header },
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });

    expect(res.statusCode).toBe(200);
    expect(wallet.calls).toHaveLength(1);
    expect(res.headers['x-payment-response']).toBeDefined();
    await app.close();
  });
});
