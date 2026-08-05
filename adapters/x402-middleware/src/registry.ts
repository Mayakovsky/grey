// Per-chain network registry (E2-A, MARKET-EXPANSION-PROJECT.md §3 E2-A). Replaces the three
// parallel hardcoded 2-value structures this package used to carry (config.ts's NETWORK_CHAIN_ID
// + isNetwork, clients.ts's inline RPC-fallback ternary, prices.ts's USDC_BY_NETWORK literal)
// with ONE table-driven source. Base mainnet/Sepolia values are carried over byte-identical from
// the pre-refactor literals; this phase changes WHERE they live, not what they are.
//
// E2-BE adds Kite mainnet (`eip155:2366`) with its real `payTo` (Tier A, ceremony-generated,
// ADDRESS ONLY — never a key, per invariant #16's "source literal" pattern) and real USDC.e
// asset data. No live Kite payment route/adapter exists yet (e2-cd+ territory) — this entry is
// data only, exercised by its own tests and the parallel grey-core/src/deps/index.ts
// CHANNEL_IDENTITY_REGISTRY entry this same directive wires in.
import type { Address } from 'viem';
import type { X402Network, UsdcAsset } from './types.js';

export interface NetworkRegistryEntry {
  chainId: number;
  /** Public default RPC used as the fallback transport leg(s) when no config-supplied
   *  `rpcUrlFallback` (BASE_RPC_URL_FALLBACK) is set (Phase F nit 3: platform-death rail).
   *  A single URL for networks with a dedicated-provider app (G4) or no documented regional
   *  layout. An array (e.g. Kite, E2 wrap-checks) for networks with no managed-provider app
   *  yet, wiring in every regional endpoint the network's own docs recommend for redundancy. */
  defaultRpcFallbackUrl: string | string[];
  usdc: UsdcAsset;
  /** Tier-A receiving address for this network, when a live payment surface exists on it.
   *  Source literal (invariant #16 pattern) — never env-configurable. Optional: Base's two
   *  entries leave this unset because Base's payTo is (and stays) env-driven via
   *  BASE_X402_PAY_TO/loadX402Config — this field does not change that, byte-identical. */
  payTo?: Address;
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
  /** E2-BE. chainId/RPC verified live against docs.gokite.ai/kite-chain/1-getting-started/
   *  network-information (2026-08-04). USDC.e address from docs.gokite.ai/kite-chain/3-
   *  developing/smart-contracts-list ("Bridged USDC (Kite AI)", deployed by Lucid Labs);
   *  name/version/decimals confirmed via a direct eth_call to name()/version()/decimals() on
   *  0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e at Kite's public RPC — NOT guessed from docs
   *  prose, which doesn't state the exact on-chain EIP-712 domain string. payTo = KITE_PAY_TO,
   *  ceremony-generated 2026-08-04 (address only, per EXPANSION-E2-BE-REVISED-KOV-directive.md). */
  'eip155:2366': {
    chainId: 2366,
    // G4 wrap-check (2026-08-05): confirmed no managed RPC provider supports Kite mainnet yet
    // (checked directly against Alchemy's chain directory — no "Kite"/"Kite AI" entry). No
    // dedicated-provider app is possible here, so this stays Kite's own public endpoints —
    // but per docs.gokite.ai/kite-chain/1-getting-started/tools's production-redundancy
    // recommendation, all four regional endpoints are wired in via fallback() (clients.ts)
    // instead of just the single global one. Revisit if a managed provider adds Kite support.
    defaultRpcFallbackUrl: [
      'https://rpc.gokite.ai/',
      'https://rpc-virginia.gokite.ai/',
      'https://rpc-tokyo.gokite.ai/',
      'https://rpc-ireland.gokite.ai/',
    ],
    usdc: {
      address: '0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e',
      name: 'Bridged USDC (Kite AI)',
      version: '2',
      decimals: 6,
    },
    payTo: '0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C',
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
