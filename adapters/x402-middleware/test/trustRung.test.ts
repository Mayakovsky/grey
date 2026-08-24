import { describe, it, expect, afterEach } from 'vitest';
import {
  TRUST_RUNG_SLUG,
  trustRungEnabled,
  trustRungPriceAtomic,
  trustRungPriceUsd,
  buildTrustRungPaymentRequirements,
} from '../src/trustRung.js';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
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
    // Real shape from @x402/extensions/bazaar's declareDiscoveryExtension — see
    // buildCdpBazaarExtension's doc comment (CDP-PHASE2-use-declareDiscoveryExtension-KOV-
    // directive.md) for the trace confirming this against the library's own compiled source.
    const ext = body.extensions!.bazaar as {
      info: { input: Record<string, unknown> };
      schema: {
        type: string;
        required: string[];
        properties: { input: { required: string[]; properties: { body: unknown } } };
      };
    };
    expect(ext.info.input.type).toBe('http');
    expect(ext.info.input.method).toBe('POST');
    expect(ext.info.input.bodyType).toBe('json');
    expect(ext.info.input.body).toEqual(buildEvaluationArtifact(TRUST_RUNG_SLUG).sample!.request);
    expect(ext.schema.type).toBe('object');
    expect(ext.schema.required).toEqual(['input']);
    expect(ext.schema.properties.input.required).toEqual(['type', 'method', 'bodyType', 'body']);
    // directive-131: the bazaar-declared copy has its external $id stripped (CDP's real validator
    // rejects it); extra.bazaar's copy is untouched, so they now genuinely differ by exactly $id.
    const { $id: strippedId, ...rawInputSchemaWithoutId } = body.accepts[0].extra.bazaar
      .inputSchema as Record<string, unknown>;
    expect(strippedId).toBeTruthy(); // sanity: the real schema really does carry one to strip
    expect(ext.schema.properties.input.properties.body).toEqual(rawInputSchemaWithoutId);
    expect(ext.schema.properties.input.properties.body).not.toHaveProperty('$id');
  });
});
