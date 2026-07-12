import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { narrowEnvelope, EnvelopeNarrowingError } from '../src/envelope/narrow';
import { buildEnvelope } from '../src/envelope/build';
import type { GreyResponseEnvelope } from '@grey/schemas/envelope';
import type { OfferingSlug, ResponseFor } from '@grey/schemas/responses';

// Use M2.5's existing envelope fixtures from @grey/schemas (resolve the package, walk to test/).
const requireFrom = createRequire(import.meta.url);
const schemasMain = requireFrom.resolve('@grey/schemas'); // → .../grey-schemas/src/index.ts
const FIX = join(dirname(schemasMain), '..', 'test', 'fixtures', 'v1');

const SLUGS: OfferingSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
  'daily_greenlight_list',
  'scam_alert_feed',
];

const loadEnvelope = (slug: string): GreyResponseEnvelope =>
  JSON.parse(readFileSync(join(FIX, slug, 'valid-full.json'), 'utf8')) as GreyResponseEnvelope;

describe('narrowEnvelope (Q6) — happy path', () => {
  it.each(SLUGS)('%s: returns the validated payload', (slug) => {
    const env = loadEnvelope(slug);
    const payload = narrowEnvelope(env, slug);
    expect(payload).toEqual(env.payload);
  });
});

describe('narrowEnvelope (Q6) — mismatch throws EnvelopeNarrowingError', () => {
  it.each(SLUGS)('%s: throws on an invalid payload', (slug) => {
    const env = loadEnvelope(slug);
    const corrupted = { ...env, payload: {} } as GreyResponseEnvelope; // empty payload fails required fields
    expect(() => narrowEnvelope(corrupted, slug)).toThrow(EnvelopeNarrowingError);
  });

  it('throws on discriminator mismatch (env.offering ≠ requested offering)', () => {
    const env = loadEnvelope('legitimacy_scan');
    expect(() => narrowEnvelope(env, 'verify_full_tech')).toThrow(EnvelopeNarrowingError);
  });

  it('carries the offering slug + ajv errors on the thrown error', () => {
    const env = loadEnvelope('legitimacy_scan');
    const corrupted = { ...env, payload: {} } as GreyResponseEnvelope;
    try {
      narrowEnvelope(corrupted, 'legitimacy_scan');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvelopeNarrowingError);
      expect((err as EnvelopeNarrowingError).offering).toBe('legitimacy_scan');
      expect((err as EnvelopeNarrowingError).errors.length).toBeGreaterThan(0);
    }
  });
});

describe('buildEnvelope + narrowEnvelope round-trip', () => {
  it.each(SLUGS)('%s: build then narrow returns the original payload', (slug) => {
    const original = loadEnvelope(slug);
    const built = buildEnvelope({
      offering: slug,
      payload: original.payload as never,
      requestId: 'req-test',
      config: { version: 'x', did: 'did:erc8004:8453:58618', name: 'Whitepaper Grey', runtime: 'grey-core', payTo: '0x0000000000000000000000000000000000000000', network: 'eip155:84532' },
      subject: { tokenAddress: null, projectName: 'Test' },
      metadata: { costUsd: 0, model: 'none', latencyMs: 0, timestamp: '2026-06-14T00:00:00.000Z', cacheHit: true },
    });
    expect(narrowEnvelope(built, slug)).toEqual(original.payload);
  });
});

describe('narrowEnvelope — compile-time narrowing (Pattern 5)', () => {
  it('result type is the offering-specific response (typechecked by tsconfig.test.json)', () => {
    const legitEnv = loadEnvelope('legitimacy_scan');
    const legit: ResponseFor<'legitimacy_scan'> = narrowEnvelope(legitEnv, 'legitimacy_scan');
    const fullEnv = loadEnvelope('verify_full_tech');
    const full: ResponseFor<'verify_full_tech'> = narrowEnvelope(fullEnv, 'verify_full_tech');
    expect(legit).toBeDefined();
    expect(full).toBeDefined();
  });
});
