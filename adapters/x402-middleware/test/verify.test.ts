import { describe, it, expect } from 'vitest';
import { decodePaymentHeader, verifyPayment } from '../src/verify.js';
import { TEST_CFG, signedPayment, mockPublicClient, buyer } from './_sign.js';

const NOW = 1_000_000n; // seconds, inside the default [0, 9_999_999_999) window
const PRICE = 250_000n;

describe('decodePaymentHeader', () => {
  it('decodes a valid header', async () => {
    const { header } = await signedPayment(TEST_CFG);
    expect(decodePaymentHeader(header).ok).toBe(true);
  });

  it('rejects non-base64-json', () => {
    expect(decodePaymentHeader('@@@ not base64 @@@').ok).toBe(false);
  });

  it('rejects a non-exact scheme', () => {
    const bad = Buffer.from(JSON.stringify({ scheme: 'upto', payload: {} })).toString('base64');
    expect(decodePaymentHeader(bad)).toMatchObject({ ok: false });
  });

  it('rejects a malformed authorization', () => {
    const bad = Buffer.from(
      JSON.stringify({
        scheme: 'exact',
        payload: { signature: '0x00', authorization: { from: 'x', to: 'y' } },
      }),
    ).toString('base64');
    expect(decodePaymentHeader(bad).ok).toBe(false);
  });
});

describe('verifyPayment — every branch', () => {
  it('accepts a valid payment (real recover + unused nonce)', async () => {
    const { payload } = await signedPayment(TEST_CFG);
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient({ used: false }), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.authorization.from).toBe(buyer.address);
  });

  it('rejects network mismatch', async () => {
    const { payload } = await signedPayment(TEST_CFG, { network: 'eip155:8453' });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'network mismatch' });
  });

  it('rejects payTo mismatch', async () => {
    const { payload } = await signedPayment(TEST_CFG, { to: buyer.address });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'payTo mismatch' });
  });

  it('rejects underpayment', async () => {
    const { payload } = await signedPayment(TEST_CFG, { value: 100_000n });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'underpayment' });
  });

  it('rejects a not-yet-valid authorization', async () => {
    const { payload } = await signedPayment(TEST_CFG, { validAfter: NOW + 100n });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'authorization not yet valid' });
  });

  it('rejects an expired authorization', async () => {
    const { payload } = await signedPayment(TEST_CFG, { validBefore: NOW - 1n });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'authorization expired' });
  });

  it('rejects a signature over a different domain', async () => {
    const { payload } = await signedPayment(TEST_CFG, { domainOverride: { name: 'Wrong Coin' } });
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient(), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'signature does not match from' });
  });

  it('rejects an already-used nonce (chain is source of truth)', async () => {
    const { payload } = await signedPayment(TEST_CFG);
    const r = await verifyPayment(TEST_CFG, payload, PRICE, mockPublicClient({ used: true }), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'authorization nonce already used' });
  });

  it('rejects when the nonce-state read fails', async () => {
    const { payload } = await signedPayment(TEST_CFG);
    const failing = {
      readContract: async () => {
        throw new Error('rpc down');
      },
      simulateContract: async () => ({}),
      waitForTransactionReceipt: async () => ({ status: 'success' as const }),
    };
    const r = await verifyPayment(TEST_CFG, payload, PRICE, failing, NOW);
    expect(r).toMatchObject({ ok: false, reason: 'could not read authorization state' });
  });
});
