// Layer 1 — chain-agnostic keystore (JSON v1) read/write.
//
// The keystore stores the account `address` as an OPAQUE string supplied by the
// caller. This layer never derives an address from the key — deriving and
// asserting the address belongs in a higher layer that owns the chain math.

import { Buffer } from 'node:buffer';
import {
  KDF_KEY_BYTES,
  KDF_MEMORY_KIB,
  KDF_PARALLELISM,
  KDF_TIME_COST,
  deriveKey,
  generateSalt,
} from './kdf.ts';
import { open, seal } from './encrypt.ts';

export const KEYSTORE_VERSION = 1;

export interface KeystoreJson {
  version: 1;
  address: string;
  kdf: {
    name: 'argon2id';
    memory: number;
    iterations: number;
    parallelism: number;
    salt: string;
  };
  cipher: {
    name: 'aes-256-gcm';
    nonce: string;
    auth_tag: string;
  };
  ciphertext: string;
}

export interface EncryptInput {
  keyBytes: Buffer;
  address: string;
  passphrase: string;
}

export interface DecryptOutput {
  keyBytes: Buffer;
  address: string;
}

/**
 * Encrypt a key under a passphrase and produce a keystore JSON object.
 * The raw key is never returned; only the encrypted form is emitted.
 */
export async function encryptKeystore(input: EncryptInput): Promise<KeystoreJson> {
  const { keyBytes, address, passphrase } = input;
  if (keyBytes.length !== KDF_KEY_BYTES) {
    throw new Error(`Key must be ${KDF_KEY_BYTES} bytes, got ${keyBytes.length}`);
  }
  const salt = generateSalt();
  const derived = await deriveKey(passphrase, salt);
  try {
    const box = seal(derived, keyBytes);
    return {
      version: KEYSTORE_VERSION,
      address,
      kdf: {
        name: 'argon2id',
        memory: KDF_MEMORY_KIB,
        iterations: KDF_TIME_COST,
        parallelism: KDF_PARALLELISM,
        salt: salt.toString('base64'),
      },
      cipher: {
        name: 'aes-256-gcm',
        nonce: box.nonce.toString('base64'),
        auth_tag: box.authTag.toString('base64'),
      },
      ciphertext: box.ciphertext.toString('base64'),
    };
  } finally {
    derived.fill(0);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Validate the shape of a parsed keystore object, throwing on any defect. */
export function validateKeystore(obj: unknown): KeystoreJson {
  if (obj === null || typeof obj !== 'object') {
    throw new Error('Keystore is not an object');
  }
  const k = obj as Record<string, unknown>;
  if (k.version !== KEYSTORE_VERSION) {
    throw new Error(`Unsupported keystore version: ${String(k.version)}`);
  }
  if (!isNonEmptyString(k.address)) {
    throw new Error('Keystore missing address');
  }
  const kdf = k.kdf as Record<string, unknown> | undefined;
  if (!kdf || kdf.name !== 'argon2id' || !isNonEmptyString(kdf.salt)) {
    throw new Error('Keystore has invalid kdf block');
  }
  if (
    typeof kdf.memory !== 'number' ||
    typeof kdf.iterations !== 'number' ||
    typeof kdf.parallelism !== 'number'
  ) {
    throw new Error('Keystore kdf parameters missing');
  }
  const cipher = k.cipher as Record<string, unknown> | undefined;
  if (
    !cipher ||
    cipher.name !== 'aes-256-gcm' ||
    !isNonEmptyString(cipher.nonce) ||
    !isNonEmptyString(cipher.auth_tag)
  ) {
    throw new Error('Keystore has invalid cipher block');
  }
  if (!isNonEmptyString(k.ciphertext)) {
    throw new Error('Keystore missing ciphertext');
  }
  return obj as KeystoreJson;
}

/**
 * Decrypt a keystore JSON object with a passphrase.
 * Returns the recovered key bytes and the stored (opaque) address.
 */
export async function decryptKeystore(
  obj: unknown,
  passphrase: string,
): Promise<DecryptOutput> {
  const ks = validateKeystore(obj);
  const salt = Buffer.from(ks.kdf.salt, 'base64');
  const derived = await deriveKey(passphrase, salt);
  try {
    const keyBytes = open(derived, {
      nonce: Buffer.from(ks.cipher.nonce, 'base64'),
      authTag: Buffer.from(ks.cipher.auth_tag, 'base64'),
      ciphertext: Buffer.from(ks.ciphertext, 'base64'),
    });
    return { keyBytes, address: ks.address };
  } finally {
    derived.fill(0);
  }
}

/** Parse a keystore JSON string into a validated object. */
export function parseKeystore(text: string): KeystoreJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Keystore is not valid JSON');
  }
  return validateKeystore(parsed);
}
