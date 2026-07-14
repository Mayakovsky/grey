import { describe, it, expect } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { makeX402PreHandler, slugFromUrl } from '../src/preHandler.js';
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
  return { req: req as unknown as FastifyRequest, reply: reply as unknown as FastifyReply, m: reply };
}

// Cast to a plain 2-arg callable — the Fastify hook type carries a `this: FastifyInstance`
// context this handler never uses, so a direct call would trip TS2684.
function gate(clients: { wallet: ReturnType<typeof mockWallet>; publicClient: ReturnType<typeof mockPublicClient> }) {
  const h = makeX402PreHandler(TEST_CFG, { wallet: clients.wallet, publicClient: clients.publicClient, now });
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
});

describe('makeX402PreHandler — orchestration', () => {
  it('402 + requirements when X-PAYMENT is absent', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan');
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient() })(req, reply);
    expect(m.statusCode).toBe(402);
    expect((m.body as { accepts: { maxAmountRequired: string }[] }).accepts[0].maxAmountRequired).toBe('250000');
  });

  it('402 on a malformed header', async () => {
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', 'garbage!!');
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient() })(req, reply);
    expect(m.statusCode).toBe(402);
  });

  it('402 on a verify failure (underpayment)', async () => {
    const { header } = await signedPayment(TEST_CFG, { value: 1n });
    const { req, reply, m } = reqReply('/v1/offerings/legitimacy_scan', header);
    await gate({ wallet: mockWallet(), publicClient: mockPublicClient({ used: false }) })(req, reply);
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
    await gate({ wallet, publicClient: mockPublicClient({ used: false, simRevert: true }) })(req, reply);
    expect(m.statusCode).toBe(402); // clean 402, not a 502 after a wasted reverted tx
    expect(wallet.calls).toHaveLength(0); // nothing broadcast → zero relayer gas
    expect(m.headers['X-PAYMENT-RESPONSE']).toBeUndefined();
  });
});
