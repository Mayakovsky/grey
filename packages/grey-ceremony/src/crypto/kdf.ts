// Layer 1 — chain-agnostic key derivation.
// Argon2id KDF: turns a human passphrase + salt into a 32-byte symmetric key.

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/** Locked Argon2id parameters. memoryCost is in KiB (262144 KiB = 256 MiB). */
export const KDF_MEMORY_KIB = 262144;
export const KDF_TIME_COST = 4;
export const KDF_PARALLELISM = 1;
export const KDF_SALT_BYTES = 16;
export const KDF_KEY_BYTES = 32;

/** Generate a fresh random 16-byte salt. */
export function generateSalt(): Buffer {
  return randomBytes(KDF_SALT_BYTES);
}

/**
 * Derive a 32-byte key from a passphrase and salt using Argon2id.
 * Deterministic: identical (passphrase, salt) inputs yield identical output.
 */
export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const key = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: KDF_MEMORY_KIB,
    timeCost: KDF_TIME_COST,
    parallelism: KDF_PARALLELISM,
    salt,
    hashLength: KDF_KEY_BYTES,
    raw: true,
  });
  return Buffer.from(key);
}
