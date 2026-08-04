// Per-chain network registry (E2-A, MARKET-EXPANSION-PROJECT.md §3 E2-A). Replaces the three
// parallel hardcoded 2-value structures this package used to carry (config.ts's NETWORK_CHAIN_ID
// + isNetwork, clients.ts's inline RPC-fallback ternary, prices.ts's USDC_BY_NETWORK literal)
// with ONE table-driven source. Only `eip155:8453` (Base mainnet) and `eip155:84532` (Base
// Sepolia) are registered in this phase — Kite's real chain-id/RPC/wallet entry is E2-B
// territory, not this one. Values below are carried over byte-identical from the pre-refactor
// literals; this phase changes WHERE they live, not what they are.
import type { X402Network, UsdcAsset } from './types.js';

export interface NetworkRegistryEntry {
  chainId: number;
  /** Public default RPC used as the fallback transport leg when neither a config-supplied
   *  `rpcUrlFallback` (BASE_RPC_URL_FALLBACK) is set (Phase F nit 3: platform-death rail). */
  defaultRpcFallbackUrl: string;
  usdc: UsdcAsset;
}

export const NETWORK_REGISTRY: Record<X402Network, NetworkRegistryEntry> = {
  'eip155:8453': {
    chainId: 8453,
    defaultRpcFallbackUrl: 'https://mainnet.base.org',
    usdc: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      version: '2',
      decimals: 6,
    },
  },
  'eip155:84532': {
    chainId: 84532,
    defaultRpcFallbackUrl: 'https://sepolia.base.org',
    usdc: {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      name: 'USDC',
      version: '2',
      decimals: 6,
    },
  },
};

/** Runtime membership check against the registry — deliberately NOT just a TS type-narrowing
 *  check, so an unregistered network fails at the data layer too, independent of what the
 *  `X402Network` union happens to contain at compile time. */
export function isRegisteredNetwork(v: string): v is X402Network {
  return Object.prototype.hasOwnProperty.call(NETWORK_REGISTRY, v);
}

/** Registry lookup. Throws on an unregistered network — never silently falls back to Base's
 *  entry. A silent fallback would make this "Base with extra steps", not an abstraction. */
export function networkRegistryEntry(network: string): NetworkRegistryEntry {
  if (!isRegisteredNetwork(network)) {
    throw new Error(`x402-middleware: no registry entry for network "${network}"`);
  }
  return NETWORK_REGISTRY[network];
}
