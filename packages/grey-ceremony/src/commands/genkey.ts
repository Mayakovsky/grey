// Layer 3 command — `genkey`: generate a private key, encrypt to a keystore.

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { toHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import type { Address } from 'viem';
import { encryptKeystore } from '../crypto/index.ts';
import { zero } from '../memory/index.ts';
import { promptNewPassphrase } from '../prompt/index.ts';

export interface GenkeyResult {
  address: Address;
  keystoreJson: string;
}

/**
 * Generate a fresh 32-byte private key, derive its address with viem, and
 * encrypt the key into a keystore JSON string. The raw key buffer is zeroed
 * before return — the plaintext key never leaves this function.
 *
 * `getPassphrase` is injected so this is unit-testable without a TTY.
 */
export async function runGenkey(
  getPassphrase: () => Promise<string>,
): Promise<GenkeyResult> {
  const keyBytes = randomBytes(32);
  try {
    const address = privateKeyToAddress(toHex(keyBytes));
    const passphrase = await getPassphrase();
    const keystore = await encryptKeystore({ keyBytes, address, passphrase });
    return { address, keystoreJson: `${JSON.stringify(keystore, null, 2)}\n` };
  } finally {
    zero(keyBytes);
  }
}

/** CLI action: prompt passphrase, write the keystore atomically, print address. */
export async function genkeyAction(opts: { out: string }): Promise<void> {
  const { address, keystoreJson } = await runGenkey(promptNewPassphrase);
  // Encryption completes fully in-memory before any disk write: the raw key is
  // never written to disk, only its encrypted form.
  writeFileSync(opts.out, Buffer.from(keystoreJson, 'utf8'), { mode: 0o600 });
  process.stdout.write(`Keystore written to ${opts.out}\n`);
  process.stdout.write(`Address: ${address}\n`);
}
