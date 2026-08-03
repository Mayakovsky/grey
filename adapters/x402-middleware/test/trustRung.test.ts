import { describe, it, expect, afterEach } from 'vitest';
import {
  TRUST_RUNG_SLUG,
  trustRungEnabled,
  trustRungPriceAtomic,
  trustRungPriceUsd,
  buildTrustRungPaymentRequirements,
} from '../src/trustRung.js';
import { TEST_CFG } from './_sign.js';

const ORIGINAL = process.env.TRUST_RUNG_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TRUST_RUNG_ENABLED;
  else process.env.TRUST_RUNG_ENABLED = ORIGINAL;
});

describe('trustRung — E1-C disable flag (Forces ruling B-1, Invariant #34)', () => {
  it('defaults to disabled when the env var is fully unset', () => {
    delete process.env.TRUST_RUNG_ENABLED;
    expect(trustRungEnabled()).toBe(false);
  });

  it('defaults to disabled for any value other than the literal string "true"', () => {
    for (const v of ['1', 'yes', 'on', 'True', 'TRUE', '']) {
      process.env.TRUST_RUNG_ENABLED = v;
      expect(trustRungEnabled(), v).toBe(false);
    }
  });

  it('is enabled only by the explicit literal "true"', () => {
    process.env.TRUST_RUNG_ENABLED = 'true';
    expect(trustRungEnabled()).toBe(true);
  });

  it('resolves the canonical $0.10 price regardless of the flag state', () => {
    delete process.env.TRUST_RUNG_ENABLED;
    expect(trustRungPriceUsd()).toBe(0.1);
    expect(trustRungPriceAtomic()).toBe(100_000n);
    process.env.TRUST_RUNG_ENABLED = 'true';
    expect(trustRungPriceUsd()).toBe(0.1);
    expect(trustRungPriceAtomic()).toBe(100_000n);
  });

  it('buildTrustRungPaymentRequirements carries the trust-rung slug, price, and Bazaar metadata', () => {
    const body = buildTrustRungPaymentRequirements(TEST_CFG, `/v1/offerings/${TRUST_RUNG_SLUG}`);
    expect(body.accepts[0].maxAmountRequired).toBe('100000');
    expect(body.accepts[0].description).toContain(TRUST_RUNG_SLUG);
    expect(body.accepts[0].extra.bazaar.serviceName).toBe('Legitimacy Trust Rung');
  });

  it('CDP/Bazaar alignment Phase 1: also carries top-level extensions.bazaar, same shape as the normal 7 routes', () => {
    const body = buildTrustRungPaymentRequirements(TEST_CFG, `/v1/offerings/${TRUST_RUNG_SLUG}`);
    expect(body.extensions).toBeTruthy();
    expect(body.extensions!.bazaar.info.input).toEqual({
      type: 'http',
      method: 'POST',
      bodyType: 'json',
    });
    expect(body.extensions!.bazaar.schema).toEqual(body.accepts[0].extra.bazaar.inputSchema);
  });
});
