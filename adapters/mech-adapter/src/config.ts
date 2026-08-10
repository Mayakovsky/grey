// Fail-closed config load — mirrors acp-adapter/x402-middleware/grey-sweeper discipline (hand-
// rolled, no zod). Any missing required env → throw → the systemd unit exits non-zero rather
// than running half-configured.
//
// Contract addresses are Base-mainnet literals (source literal pattern, invariant #16), not
// env-configurable — verified 2026-08-08 against two independent primary sources (mech-client's
// mech_client/configs/mechs.json and autonolas-marketplace's docs/configuration.json) plus a
// direct eth_getCode RPC check confirming real deployed bytecode. See MARKETPLACE_ADDRESSES below
// for the full citation. RPC URL and the two wallet addresses ARE env-configurable (G4 — wallets
// are ceremony-generated, address only, never a key in this repo).
import process from 'node:process';
import type { Address } from 'viem';

/** Grey's on-chain ERC-8004 DID — the unifying identity layer (Base mainnet, tokenId 58618). */
export const GREY_DID = 'did:erc8004:8453:58618';

/** Base mainnet Mech Marketplace deployment (chain id 8453). Source: autonolas-marketplace
 *  docs/configuration.json (raw-fetched, not summarized), cross-checked against mech-client's
 *  mech_client/configs/mechs.json (independent repo, same values) and a direct eth_getCode call
 *  against MECH_MARKETPLACE_PROXY on Base mainnet confirming real deployed bytecode (2026-08-08).
 *  MECH_MARKETPLACE_PROXY is the address callers use — MechMarketplace (no "Proxy" suffix) is the
 *  implementation contract behind it, kept here for reference only; never call it directly. */
export const MARKETPLACE_ADDRESSES = {
  chainId: 8453,
  mechMarketplaceProxy: '0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020' as Address,
  mechMarketplaceImplementation: '0x155547857680A6D51bebC5603397488988DEb1c8' as Address,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  /** MechFactory* addresses — one per payment type. All five confirmed deployed on Base
   *  (contrary to the directive's caution not to assume parity with Gnosis — Base actually has
   *  full parity, verified via the same configuration.json source). `createMech(serviceRegistry,
   *  serviceId, payload)` on any of these requires an existing Olas `serviceId` from the
   *  ServiceRegistry contract — a separate, unresolved prerequisite. See mechAdapter.ts's
   *  `registerAsMech` doc comment. */
  factories: {
    NATIVE: '0x2E008211f34b25A7d7c102403c6C2C3B665a1abe' as Address,
    USDC_TOKEN: '0x5B70A66fe68c4c86FFd724B58cc56049c70e9D3D' as Address,
    OLAS_TOKEN: '0x97371B1C0cDA1D04dFc43DFb50a04645b7Bc9BEe' as Address,
    NATIVE_NVM: '0x847bBE8b474e0820215f818858e23F5f5591855A' as Address,
    TOKEN_NVM_USDC: '0x7beD01f8482fF686F025628e7780ca6C1f0559fc' as Address,
  },
} as const;

export type MechPaymentType = keyof typeof MARKETPLACE_ADDRESSES.factories;

/** Base mainnet Olas ServiceRegistry deployment (BION-DIRECTIVE-28) — the prerequisite lifecycle
 *  a service must complete before MechFactory*.createMech() will accept its serviceId (see
 *  MARKETPLACE_ADDRESSES's factories doc comment). Source: two independently-generated files in
 *  valory-xyz/autonolas-registries (scripts/deployment/l2/globals_base_mainnet.json and
 *  docs/configuration.json, both raw-fetched, values agree), cross-checked via direct eth_getCode
 *  RPC calls confirming real deployed bytecode at each address (2026-08-08). serviceManagerProxy
 *  is the address callers use; serviceManagerImplementation is reference only, never called
 *  directly (same proxy pattern as MARKETPLACE_ADDRESSES). gnosisSafeMultisig is the multisig
 *  implementation address `deploy()` expects. Real Base Sepolia testnet addresses also exist for
 *  this contract set (serviceRegistry 0x31D3202d8744B16A120117A053459DDFAE93c855, serviceManager
 *  0x5BA58970c2Ae16Cf6218783018100aF2dCcFc915) — unlike the Marketplace contracts (e3-b1), which
 *  have none — not wired here since this directive's fork-test posture matches e3-b1's for
 *  consistency, but worth knowing for a future live testnet dry run. */
export const SERVICE_REGISTRY_ADDRESSES = {
  chainId: 8453,
  serviceRegistryL2: '0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE' as Address,
  serviceRegistryTokenUtility: '0x34C895f302D0b5cf52ec0Edd3945321EB0f83dd5' as Address,
  serviceManagerImplementation: '0x32B5A40B43C4eDb123c9cFa6ea97432380a38dDF' as Address,
  serviceManagerProxy: '0x1262136cac6a06A782DC94eb3a3dF0b4d09FF6A6' as Address,
  operatorWhitelist: '0x3d77596beb0f130a4415df3D2D8232B3d3D31e44' as Address,
  gnosisSafeMultisig: '0x22bE6fDcd3e29851B29b512F714C328A00A96B83' as Address,
} as const;

/** Ceremony complete (2026-08-08, Forces-run per EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-
 *  FORCES.md) — address only, no key or passphrase ever passed through this codebase. Recorded
 *  here for reference/traceability (same posture as KITE_POOL_WALLET_ADDRESS in grey-sweeper's
 *  config.ts); `loadConfig()` above still resolves these from env at runtime and stays the
 *  actual, tested source of truth — these constants are not wired into it. Deployment sets
 *  BASE_MECH_PAY_TO / BASE_MECH_POOL_WALLET to the values below; not done by this directive
 *  (no deploy in scope), so leaving the env mechanism authoritative rather than hardcoding these
 *  into loadConfig and re-touching an already-gated test surface for a shape the directive didn't
 *  ask for. */
export const BASE_MECH_PAY_TO_ADDRESS = '0x36c4a16ED1DD12056150E36dFe2271733366BAC5' as const;
export const BASE_MECH_POOL_WALLET_ADDRESS = '0xB98A06D0D92A429dFeb95438BaE9e624A6401727' as const;

export interface MechAdapterConfig {
  /** Tier A hot wallet — receives mech task payments. Ceremony-generated, address only. */
  payToAddress: Address;
  /** Tier B pool wallet — consolidation point before eventual Tier D sweep. Address only. */
  poolWalletAddress: Address;
  /** Base RPC endpoint. Defaults to Base's own public RPC (verified reachable without a
   *  Cloudflare challenge, unlike some third-party RPCs hit during research). */
  rpcUrl: string;
  /** grey_pipeline_rw runtime credential for the shared handlers' cache reads. */
  databaseUrl: string;
  /** FDQ-63-style safety gate, same seam as acp-adapter's observeOnly — suppresses every
   *  on-chain write path (create/request/deliverMarketplace) when true. Defaults true: this
   *  adapter has no confirmed mainnet registration yet (Olas ServiceRegistry prerequisite
   *  unresolved — see mechAdapter.ts), so shipping with writes enabled by default would be wrong. */
  observeOnly: boolean;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    throw new Error(`mech-adapter: missing required env ${key}`);
  }
  return v.trim();
}

function isAddress(v: string): v is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function requiredAddress(env: Env, key: string): Address {
  const raw = required(env, key);
  if (!isAddress(raw)) {
    throw new Error(`mech-adapter: ${key} is not a valid 0x-address, got "${raw}"`);
  }
  return raw as Address;
}

export function loadConfig(env: Env = process.env): MechAdapterConfig {
  return {
    payToAddress: requiredAddress(env, 'BASE_MECH_PAY_TO'),
    poolWalletAddress: requiredAddress(env, 'BASE_MECH_POOL_WALLET'),
    rpcUrl: env.BASE_RPC_URL?.trim() || 'https://mainnet.base.org',
    databaseUrl: required(env, 'GREY_DATABASE_URL'),
    observeOnly: (env.MECH_ADAPTER_OBSERVE_ONLY?.trim() ?? 'true') !== 'false',
  };
}
