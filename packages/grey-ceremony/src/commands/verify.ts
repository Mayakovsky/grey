// Layer 3 command — `verify`: read-only ownerOf + getAgentWallet.

import process from 'node:process';
import type { Address, PublicClient } from 'viem';
import { resolveRegistry } from '../eip712/index.ts';
import { callRead, makePublicClient, resolveRpcUrl } from '../rpc/index.ts';
import {
  decodeGetAgentWallet,
  decodeOwnerOf,
  encodeGetAgentWallet,
  encodeOwnerOf,
} from '../transactions/index.ts';

export interface VerifyParams {
  tokenId: bigint;
  chainId: number;
  registry?: string;
}

/** Read owner + agent wallet for a tokenId. publicClient injected for tests. */
export async function runVerify(
  publicClient: PublicClient,
  params: VerifyParams,
): Promise<{ owner: Address; agentWallet: Address }> {
  const to = resolveRegistry(params.chainId, params.registry as Address | undefined);
  const ownerRaw = await callRead(publicClient, to, encodeOwnerOf(params.tokenId));
  const agentRaw = await callRead(publicClient, to, encodeGetAgentWallet(params.tokenId));
  return {
    owner: decodeOwnerOf(ownerRaw),
    agentWallet: decodeGetAgentWallet(agentRaw),
  };
}

/** CLI action. */
export async function verifyAction(opts: {
  tokenId: string;
  chainId: string;
  registry?: string;
  rpcUrl?: string;
}): Promise<void> {
  const chainId = Number(opts.chainId);
  const rpcUrl = resolveRpcUrl(opts.rpcUrl);
  const publicClient = makePublicClient(chainId, rpcUrl);
  const { owner, agentWallet } = await runVerify(publicClient, {
    tokenId: BigInt(opts.tokenId),
    chainId,
    registry: opts.registry,
  });
  process.stdout.write(`owner:       ${owner}\n`);
  process.stdout.write(`agentWallet: ${agentWallet}\n`);
}
