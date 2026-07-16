// Structural viem client shapes — mirrors grey-sweeper's *Like interfaces so tests inject
// plain mocks and production passes real viem clients (built by makeRelayerClients).
import { createWalletClient, createPublicClient, fallback, http, defineChain, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { X402Config } from './types.js';

export interface PublicClientLike {
  readContract(args: unknown): Promise<unknown>;
  /** FDQ-40: dry-run a settlement; throws if it would revert (so we never broadcast a doomed tx). */
  simulateContract(args: unknown): Promise<unknown>;
  waitForTransactionReceipt(args: {
    hash: Hex;
    confirmations?: number;
  }): Promise<{ status: 'success' | 'reverted' }>;
}

export interface WalletClientLike {
  writeContract(args: unknown): Promise<Hex>;
}

export interface RelayerClients {
  wallet: WalletClientLike;
  publicClient: PublicClientLike;
  relayerAddress: Address;
}

/** Build the real relayer wallet + a read client from config. The relayer key is loaded HERE
 *  (inside the middleware package) and never leaves it — grey-core never sees it (invariant #19). */
export function makeRelayerClients(cfg: X402Config): RelayerClients {
  const account = privateKeyToAccount(cfg.relayerPrivateKey);
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.network,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const transport = fallback([
    http(cfg.rpcUrl),
    // Phase F nit 3 (platform-death rail): a dead/rate-limited primary degrades to
    // the fallback instead of failing verify/settle. Chain-matched public default.
    http(cfg.rpcUrlFallback ?? (cfg.chainId === 84532 ? 'https://sepolia.base.org' : 'https://mainnet.base.org')),
  ]);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });
  return {
    wallet: wallet as unknown as WalletClientLike,
    publicClient: publicClient as unknown as PublicClientLike,
    relayerAddress: account.address,
  };
}
