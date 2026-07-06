import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import {
  decryptKeystore,
  encryptKeystore,
  parseKeystore,
} from '../../src/crypto/index.ts';

const PASSPHRASE = 'six word passphrase goes right here';

describe('keystore', () => {
  it('round-trips key bytes and preserves the address field', async () => {
    const keyBytes = randomBytes(32);
    const address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const ks = await encryptKeystore({ keyBytes, address, passphrase: PASSPHRASE });
    const out = await decryptKeystore(ks, PASSPHRASE);
    expect(Buffer.compare(out.keyBytes, keyBytes)).toBe(0);
    expect(out.address).toBe(address);
  });

  it('pins Argon2id params memory=262144, iterations=4, parallelism=1', async () => {
    const ks = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    expect(ks.version).toBe(1);
    expect(ks.kdf.memory).toBe(262144);
    expect(ks.kdf.iterations).toBe(4);
    expect(ks.kdf.parallelism).toBe(1);
    expect(ks.cipher.name).toBe('aes-256-gcm');
  });

  it('uses a unique salt per keystore', async () => {
    const k1 = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    const k2 = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    expect(k1.kdf.salt).not.toBe(k2.kdf.salt);
    expect(k1.cipher.nonce).not.toBe(k2.cipher.nonce);
  });

  it('rejects a non-1 version', async () => {
    const ks = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    const bad = { ...ks, version: 2 };
    await expect(decryptKeystore(bad, PASSPHRASE)).rejects.toThrow(/version/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseKeystore('{not json')).toThrow(/JSON/i);
  });

  it('rejects a missing required field', async () => {
    const ks = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    const { ciphertext: _drop, ...missing } = ks;
    await expect(decryptKeystore(missing, PASSPHRASE)).rejects.toThrow(/ciphertext/i);
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const ks = await encryptKeystore({
      keyBytes: randomBytes(32),
      address: '0xabc',
      passphrase: PASSPHRASE,
    });
    await expect(decryptKeystore(ks, 'wrong passphrase entirely here')).rejects.toThrow();
  });
});
