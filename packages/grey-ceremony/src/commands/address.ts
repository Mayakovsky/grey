// Layer 3 command — `address`: decrypt a keystore, assert integrity, print.
//
// The DERIVE-AND-ASSERT (privateKeyToAddress(key) === keystore.address) lives
// here because it needs viem — Layer 1's keystore stores the address opaquely.

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { getAddress, toHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import type { Address } from 'viem';
import { decryptKeystore, parseKeystore } from '../crypto/index.ts';
import { zero } from '../memory/index.ts';
import { promptPassphrase } from '../prompt/index.ts';

export interface UnlockedKey {
  /** Caller MUST zero this when done. */
  keyBytes: Buffer;
  address: Address;
}

/**
 * Decrypt a keystore object and assert the stored address matches the address
 * derived from the recovered key. Throws on mismatch. On success the caller
 * owns `keyBytes` and is responsible for zeroing it.
 */
export async function unlockKeystore(
  keystoreObj: unknown,
  passphrase: string,
): Promise<UnlockedKey> {
  const { keyBytes, address } = await decryptKeystore(keystoreObj, passphrase);
  let derived: Address;
  try {
    derived = privateKeyToAddress(toHex(keyBytes));
  } catch (e) {
    zero(keyBytes);
    throw e;
  }
  if (getAddress(derived) !== getAddress(address)) {
    zero(keyBytes);
    throw new Error(
      `Keystore integrity check failed: stored address ${address} != derived ${derived}`,
    );
  }
  return { keyBytes, address: getAddress(address) };
}

/** Decrypt a keystore file and return the verified address (zeros the key). */
export async function runAddress(
  keystoreObj: unknown,
  passphrase: string,
  revealPrivate = false,
): Promise<{ address: Address; privateKey?: `0x${string}` }> {
  const unlocked = await unlockKeystore(keystoreObj, passphrase);
  try {
    const out: { address: Address; privateKey?: `0x${string}` } = { address: unlocked.address };
    if (revealPrivate) {
      out.privateKey = toHex(unlocked.keyBytes);
    }
    return out;
  } finally {
    zero(unlocked.keyBytes);
  }
}

/** CLI action. */
export async function addressAction(opts: {
  keyfile: string;
  revealPrivate?: boolean;
}): Promise<void> {
  const keystore = parseKeystore(readFileSync(opts.keyfile, 'utf8'));
  const passphrase = await promptPassphrase();
  const { address, privateKey } = await runAddress(keystore, passphrase, opts.revealPrivate);
  process.stdout.write(`Address: ${address}\n`);
  if (privateKey) {
    process.stdout.write(
      '\n!!! WARNING — PRIVATE KEY REVEALED BELOW — DO NOT SHARE !!!\n',
    );
    process.stdout.write(`${privateKey}\n`);
    process.stdout.write('!!! Clear your terminal scrollback now. !!!\n');
  }
}
