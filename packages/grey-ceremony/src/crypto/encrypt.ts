// Layer 1 — chain-agnostic authenticated encryption.
// AES-256-GCM: 12-byte nonce, 16-byte auth tag, no AAD.

import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const NONCE_BYTES = 12;
export const AUTH_TAG_BYTES = 16;

export interface SealedBox {
  nonce: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/** Generate a fresh random 12-byte nonce. */
export function generateNonce(): Buffer {
  return randomBytes(NONCE_BYTES);
}

/**
 * Encrypt plaintext under a 32-byte key with AES-256-GCM.
 * A fresh random nonce is generated per call.
 */
export function seal(key: Buffer, plaintext: Buffer): SealedBox {
  const nonce = generateNonce();
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { nonce, authTag, ciphertext };
}

/**
 * Decrypt a sealed box under a 32-byte key with AES-256-GCM.
 * Throws if the auth tag fails (tampered ciphertext / wrong key).
 */
export function open(key: Buffer, box: SealedBox): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, box.nonce);
  decipher.setAuthTag(box.authTag);
  return Buffer.concat([decipher.update(box.ciphertext), decipher.final()]);
}
