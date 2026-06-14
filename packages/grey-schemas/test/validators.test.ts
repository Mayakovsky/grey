import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { envelopeValidator, offeringValidators } from '../src/validators';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'v1');
const slugs = readdirSync(FIX);

// Every fixture is a full envelope. valid-* must pass envelopeValidator; invalid-* must fail.
describe.each(slugs)('envelope validation: %s', (slug) => {
  const dir = join(FIX, slug);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  it.each(files)('%s', (file) => {
    const obj = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const ok = envelopeValidator(obj);
    if (file.startsWith('valid-')) {
      expect(ok, JSON.stringify(envelopeValidator.errors)).toBe(true);
    } else {
      expect(ok).toBe(false);
      expect(envelopeValidator.errors?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

// Per-offering payload validators accept their own valid-full payload.
describe.each(slugs)('payload validator: %s', (slug) => {
  it('accepts its own valid-full payload', () => {
    const env = JSON.parse(readFileSync(join(FIX, slug, 'valid-full.json'), 'utf8'));
    const validate = offeringValidators[slug];
    expect(validate, `no validator for ${slug}`).toBeTruthy();
    expect(validate(env.payload), JSON.stringify(validate.errors)).toBe(true);
  });
});

// Envelope-level payload-XOR-error invariants.
describe('envelope payload XOR error', () => {
  const valid = JSON.parse(readFileSync(join(FIX, 'legitimacy_scan', 'valid-minimum.json'), 'utf8'));
  const base = { ...valid };
  delete base.payload;

  it('accepts an error response (no payload)', () => {
    const obj = { ...base, error: { code: 'BAD_REQUEST', message: 'bad input', retryable: false } };
    expect(envelopeValidator(obj), JSON.stringify(envelopeValidator.errors)).toBe(true);
  });
  it('rejects both payload and error present', () => {
    const obj = { ...valid, error: { code: 'INTERNAL_ERROR', message: 'x', retryable: false } };
    expect(envelopeValidator(obj)).toBe(false);
  });
  it('rejects neither payload nor error', () => {
    expect(envelopeValidator(base)).toBe(false);
  });
  it('rejects an unknown error code', () => {
    const obj = { ...base, error: { code: 'NOPE', message: 'x', retryable: false } };
    expect(envelopeValidator(obj)).toBe(false);
  });
});
