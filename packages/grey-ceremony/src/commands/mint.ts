// Layer 3 command — `mint`: ERC-8004 register() → mint an agent identity.

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Account, PublicClient, WalletClient } from 'viem';
import { parseKeystore } from '../crypto/index.ts';
import { resolveRegistry } from '../eip712/index.ts';
import { zero } from '../memory/index.ts';
import { promptPassphrase } from '../prompt/index.ts';
import { makePublicClient, makeWalletClient, resolveRpcUrl, sendAndAwait } from '../rpc/index.ts';
import { encodeRegister, parseRegisteredTokenId } from '../transactions/index.ts';
import { unlockKeystore } from './address.ts';
import { confirmYes } from './confirm.ts';

export interface MintParams {
  chainId: number;
  registry?: string;
}

/**
 * Broadcast a `register()` tx and return the minted tokenId.
 * Clients + account injected so unit tests mock the rpc layer entirely.
 */
export async function runMint(
  account: Account,
  wallet: WalletClient,
  publicClient: PublicClient,
  params: MintParams,
): Promise<{ hash: `0x${string}`; tokenId: bigint | null }> {
  const to = resolveRegistry(params.chainId, params.registry as `0x${string}` | undefined);
  const data = encodeRegister();
  const { hash, receipt } = await sendAndAwait(wallet, publicClient, account, { to, data });
  const tokenId = parseRegisteredTokenId(receipt.logs);
  return { hash, tokenId };
}

/** CLI action. */
export async function mintAction(opts: {
  ownerKeyfile: string;
  chainId: string;
  registry?: string;
  rpcUrl?: string;
}): Promise<void> {
  const chainId = Number(opts.chainId);
  const keystore = parseKeystore(readFileSync(opts.ownerKeyfile, 'utf8'));
  const passphrase = await promptPassphrase();
  const unlocked = await unlockKeystore(keystore, passphrase);

  try {
    const to = resolveRegistry(chainId, opts.registry as `0x${string}` | undefined);
    process.stdout.write('Transaction preview:\n');
    process.stdout.write(`  to (registry): ${to}\n`);
    process.stdout.write(`  call:          register()\n`);
    process.stdout.write(`  chainId:       ${chainId}\n`);
    if (!(await confirmYes())) {
      process.stderr.write('Aborted.\n');
      process.exitCode = 2;
      return;
    }

    const rpcUrl = resolveRpcUrl(opts.rpcUrl);
    const account = privateKeyToAccount(toHex(unlocked.keyBytes));
    const wallet = makeWalletClient(chainId, rpcUrl, account);
    const publicClient = makePublicClient(chainId, rpcUrl);
    const { hash, tokenId } = await runMint(account, wallet, publicClient, {
      chainId,
      registry: opts.registry,
    });
    process.stdout.write(`tx: ${hash}\n`);
    process.stdout.write(`tokenId: ${tokenId === null ? '(not found in logs)' : tokenId}\n`);
  } finally {
    zero(unlocked.keyBytes);
  }
}
