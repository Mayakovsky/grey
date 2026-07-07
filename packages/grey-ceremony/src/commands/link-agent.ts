// Layer 3 command — `link-agent`: owner broadcasts setAgentWallet(...).

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { getAddress, isAddress, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Account, Address, Hex, PublicClient, WalletClient } from 'viem';
import { parseKeystore } from '../crypto/index.ts';
import { resolveRegistry } from '../eip712/index.ts';
import { zero } from '../memory/index.ts';
import { promptPassphrase } from '../prompt/index.ts';
import { makePublicClient, makeWalletClient, resolveRpcUrl, sendAndAwait } from '../rpc/index.ts';
import { encodeSetAgentWallet } from '../transactions/index.ts';
import { unlockKeystore } from './address.ts';
import { confirmYes } from './confirm.ts';
import { deadlineWarning } from './deadline.ts';

export interface LinkAgentParams {
  tokenId: bigint;
  newWallet: string;
  deadline: bigint;
  signature: string;
  chainId: number;
  registry?: string;
}

export function validateLinkAgent(params: LinkAgentParams): {
  newWallet: Address;
  signature: Hex;
  verifyingContract: Address;
} {
  if (!isAddress(params.newWallet)) {
    throw new Error(`--new-wallet is not a valid address: ${params.newWallet}`);
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(params.signature)) {
    throw new Error('--signature must be a 65-byte (0x + 130 hex) signature');
  }
  return {
    newWallet: getAddress(params.newWallet),
    signature: params.signature as Hex,
    verifyingContract: resolveRegistry(params.chainId, params.registry as Address | undefined),
  };
}

/** Broadcast setAgentWallet(...). Clients injected for testability. */
export async function runLinkAgent(
  account: Account,
  wallet: WalletClient,
  publicClient: PublicClient,
  params: LinkAgentParams,
): Promise<{ hash: Hex }> {
  const { newWallet, signature, verifyingContract } = validateLinkAgent(params);
  const data = encodeSetAgentWallet(params.tokenId, newWallet, params.deadline, signature);
  const { hash } = await sendAndAwait(wallet, publicClient, account, {
    to: verifyingContract,
    data,
  });
  return { hash };
}

/** CLI action. */
export async function linkAgentAction(opts: {
  ownerKeyfile: string;
  tokenId: string;
  newWallet: string;
  deadline: string;
  signature: string;
  chainId: string;
  registry?: string;
  rpcUrl?: string;
}): Promise<void> {
  const chainId = Number(opts.chainId);
  const params: LinkAgentParams = {
    tokenId: BigInt(opts.tokenId),
    newWallet: opts.newWallet,
    deadline: BigInt(opts.deadline),
    signature: opts.signature,
    chainId,
    registry: opts.registry,
  };
  const { newWallet, verifyingContract } = validateLinkAgent(params);

  const dw = deadlineWarning(params.deadline, Math.floor(Date.now() / 1000));
  if (dw) process.stderr.write(dw + '\n');

  const keystore = parseKeystore(readFileSync(opts.ownerKeyfile, 'utf8'));
  const passphrase = await promptPassphrase();
  const unlocked = await unlockKeystore(keystore, passphrase);

  try {
    process.stdout.write('Transaction preview:\n');
    process.stdout.write(`  to (registry): ${verifyingContract}\n`);
    process.stdout.write(
      `  call:          setAgentWallet(${params.tokenId}, ${newWallet}, ${params.deadline}, <sig>)\n`,
    );
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
    const { hash } = await runLinkAgent(account, wallet, publicClient, params);
    process.stdout.write(`tx: ${hash}\n`);
  } finally {
    zero(unlocked.keyBytes);
  }
}
