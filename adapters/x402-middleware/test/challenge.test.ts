import { describe, it, expect } from 'vitest';
import { buildPaymentRequirements, buildCdpBazaarExtension } from '../src/challenge.js';
import { TEST_CFG } from './_sign.js';

describe('buildPaymentRequirements — strict-canonical x402', () => {
  it('emits one exact-scheme accepts entry carrying the route price', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'verify_whitepaper',
      '/v1/offerings/verify_whitepaper',
      'payment required',
    );
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    const a = body.accepts[0];
    expect(a.scheme).toBe('exact');
    expect(a.network).toBe('eip155:84532');
    expect(a.maxAmountRequired).toBe('1500000');
    expect(a.payTo).toBe(TEST_CFG.payTo);
    expect(a.asset).toBe(TEST_CFG.usdc.address);
    expect(a.maxTimeoutSeconds).toBe(120);
    expect(a.resource).toBe('/v1/offerings/verify_whitepaper');
    expect(a.extra.name).toBe(TEST_CFG.usdc.name);
    expect(a.extra.version).toBe(TEST_CFG.usdc.version);
    expect(body.error).toBe('payment required');
  });

  it('omits server nonce/expiresAt (strict-canonical ruling)', () => {
    const body = buildPaymentRequirements(TEST_CFG, 'legitimacy_scan', '/r');
    expect(body).not.toHaveProperty('nonce');
    expect(body).not.toHaveProperty('expiresAt');
    expect(body.accepts[0]).not.toHaveProperty('nonce');
    expect(body.accepts[0]).not.toHaveProperty('expiresAt');
  });

  it('omits error when none is given', () => {
    expect(buildPaymentRequirements(TEST_CFG, 'legitimacy_scan', '/r').error).toBeUndefined();
  });

  it('carries per-slug pricing', () => {
    expect(
      buildPaymentRequirements(TEST_CFG, 'daily_tech_brief', '/r').accepts[0].maxAmountRequired,
    ).toBe('8000000');
    expect(
      buildPaymentRequirements(TEST_CFG, 'quick_protocol_facts', '/r').accepts[0].maxAmountRequired,
    ).toBe('300000');
  });

  it('carries Bazaar discovery metadata from the single EvaluationKit source (E1-B, Invariant #33)', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'legitimacy_scan',
      '/v1/offerings/legitimacy_scan',
    );
    const bazaar = body.accepts[0].extra.bazaar;
    expect(bazaar.discoverable).toBe(true);
    expect(bazaar.serviceName).toBe('Project Legitimacy Scan');
    expect(bazaar.tags).toContain('crypto');
    expect(typeof bazaar.description).toBe('string');
    expect(bazaar.inputSchema).toBeTruthy();
    expect(bazaar.outputSchema).toBeTruthy();
    expect(bazaar.iconUrl).toBe('https://whitepapergrey.com/icons/legitimacy_scan.svg');
  });

  it('CDP/Bazaar alignment Phase 1: also carries the top-level extensions.bazaar shape, alongside (not replacing) extra.bazaar', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'legitimacy_scan',
      '/v1/offerings/legitimacy_scan',
    );
    // extra.bazaar is untouched — Task 3 says keep it, other consumers may read it.
    expect(body.accepts[0].extra.bazaar).toBeTruthy();
    // extensions sits at the top of the body, sibling to accepts, not inside accepts[0].
    expect(body.extensions).toBeTruthy();
    expect(body).not.toHaveProperty('accepts[0].extensions');
    const ext = body.extensions!.bazaar;
    expect(ext.info.input).toEqual({ type: 'http', method: 'POST', bodyType: 'json' });
    expect(ext.info.output?.example).toBeTruthy(); // legitimacy_scan has a sample response (Round 2)
    expect(ext.schema).toEqual(body.accepts[0].extra.bazaar.inputSchema); // same JSON Schema, reshaped location
  });

  it('buildCdpBazaarExtension is a pure reshape — same output for the same EvaluationKitEntry input', () => {
    const kitA = { inputSchema: { type: 'object' }, sample: undefined } as never;
    const extA = buildCdpBazaarExtension(kitA);
    expect(extA.bazaar.schema).toEqual({ type: 'object' });
    expect(extA.bazaar.info.output).toBeUndefined(); // no sample -> no output example, not a fabricated one
  });
});
