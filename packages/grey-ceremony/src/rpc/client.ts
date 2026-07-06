// Layer 2 — generic EVM RPC adapter. Chain-agnostic: a chainId + RPC URL in,
// viem clients out. No contract vocabulary lives here.

import process from 'node:process';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import type { Account, Chain, PublicClient, WalletClient } from 'viem';

/** Build a minimal viem Chain object from a chainId and RPC URL. */
export function makeChain(chainId: number, rpcUrl: string): Chain {
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** Resolve the RPC URL: explicit arg wins, else GREY_CEREMONY_RPC_URL env. */
export function resolveRpcUrl(explicit?: string): string {
  const url = explicit ?? process.env.GREY_CEREMONY_RPC_URL;
  if (!url) {
    throw new Error(
      'No RPC URL: pass --rpc-url or set GREY_CEREMONY_RPC_URL',
    );
  }
  return url;
}

/** A read-only public client. */
export function makePublicClient(chainId: number, rpcUrl: string): PublicClient {
  const chain = makeChain(chainId, rpcUrl);
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

/** A wallet client bound to a local account for sending transactions. */
export function makeWalletClient(
  chainId: number,
  rpcUrl: string,
  account: Account,
): WalletClient {
  const chain = makeChain(chainId, rpcUrl);
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}
