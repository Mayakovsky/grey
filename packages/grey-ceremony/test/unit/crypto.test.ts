import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import {
  KDF_KEY_BYTES,
  deriveKey,
  generateSalt,
  open,
  seal,
} from '../../src/crypto/index.ts';

describe('Argon2id KDF', () => {
  it('is deterministic for the same passphrase+salt and yields 32 bytes', async () => {
    const salt = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes
    expect(salt.length).toBe(16);
    const a = await deriveKey('correct horse battery staple six', salt);
    const b = await deriveKey('correct horse battery staple six', salt);
    expect(a.length).toBe(KDF_KEY_BYTES);
    expect(a.length).toBe(32);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('produces different keys for different salts', async () => {
    const a = await deriveKey('pw', generateSalt());
    const b = await deriveKey('pw', generateSalt());
    expect(Buffer.compare(a, b)).not.toBe(0);
  });
});

describe('AES-256-GCM', () => {
  it('round-trips 32 bytes', () => {
    const key = randomBytes(32);
    const pt = randomBytes(32);
    const box = seal(key, pt);
    const out = open(key, box);
    expect(Buffer.compare(out, pt)).toBe(0);
  });

  it('throws when a ciphertext byte is flipped (auth failure)', () => {
    const key = randomBytes(32);
    const pt = randomBytes(32);
    const box = seal(key, pt);
    const tampered = Buffer.from(box.ciphertext);
    tampered[0] ^= 0xff;
    expect(() => open(key, { ...box, ciphertext: tampered })).toThrow();
  });

  it('uses 12-byte nonces and 16-byte auth tags', () => {
    const key = randomBytes(32);
    const box = seal(key, randomBytes(32));
    expect(box.nonce.length).toBe(12);
    expect(box.authTag.length).toBe(16);
  });

  it('generates a unique nonce per encryption', () => {
    const key = randomBytes(32);
    const b1 = seal(key, randomBytes(32));
    const b2 = seal(key, randomBytes(32));
    expect(Buffer.compare(b1.nonce, b2.nonce)).not.toBe(0);
  });
});
