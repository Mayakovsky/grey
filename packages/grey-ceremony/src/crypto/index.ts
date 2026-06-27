// Layer 1 — crypto public surface.
export {
  KDF_KEY_BYTES,
  KDF_MEMORY_KIB,
  KDF_PARALLELISM,
  KDF_SALT_BYTES,
  KDF_TIME_COST,
  deriveKey,
  generateSalt,
} from './kdf.ts';
export { AUTH_TAG_BYTES, NONCE_BYTES, generateNonce, open, seal } from './encrypt.ts';
export type { SealedBox } from './encrypt.ts';
export {
  KEYSTORE_VERSION,
  decryptKeystore,
  encryptKeystore,
  parseKeystore,
  validateKeystore,
} from './keystore.ts';
export type { DecryptOutput, EncryptInput, KeystoreJson } from './keystore.ts';
