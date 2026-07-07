import process from 'node:process';

type Env = Record<string, string | undefined>;

/**
 * Tier-B sweep destination — the Base pool wallet.
 *
 * Invariant #16: Tier-B destination is a source literal; env CANNOT redirect the
 * sweep destination. This is the canonical Tier-B pool address from the §6.1
 * ceremony (EIP-55 self-checksum verified via viem getAddress). NEVER read this
 * from env — changing the destination requires a code change + review.
 */
export const BASE_POOL_WALLET_ADDRESS = '0x9324525D2Af0B0636F438B1A85f67F89AF821d74' as const;

/**
 * Base Sepolia (84532) test pool wallet — Phase B smoke ONLY. Throwaway testnet
 * address; no real funds depend on it. Kept as a documented testnet entry so the
 * sweeper can be proved end-to-end on Sepolia without ever routing to the mainnet
 * Tier-B destination.
 */
export const SEPOLIA_TEST_POOL_WALLET_ADDRESS =
  '0x9a1fCfCA9f5F396295e903CB64b561a1415a441f' as const;

/**
 * chainId → hard-coded sweep destination. Every entry is a SOURCE LITERAL; env
 * CANNOT redirect the destination (invariant #16). Typed `Record<number, …>`
 * (mirrors REGISTRY_BY_CHAIN_ID) so an unlisted chainId reads back falsy and
 * {@link poolWalletFor} fails closed rather than silently defaulting to mainnet.
 */
export const POOL_WALLET_BY_CHAIN_ID: Record<number, `0x${string}`> = {
  8453: BASE_POOL_WALLET_ADDRESS,
  84532: SEPOLIA_TEST_POOL_WALLET_ADDRESS,
};

/**
 * Resolve the sweep destination for a chain. FAILS CLOSED (FDQ-23 hardening,
 * ruled by Forces 2026-07-06): throws on any chainId not explicitly listed —
 * NEVER defaults to the mainnet entry.
 */
export function poolWalletFor(chainId: number): `0x${string}` {
  const dest = POOL_WALLET_BY_CHAIN_ID[chainId];
  if (!dest) {
    throw new Error(
      `grey-sweeper: no sweep destination configured for chainId ${chainId} — refusing to sweep`,
    );
  }
  return dest;
}

/** 200 USDC, 6 decimals. */
export const THRESHOLD_USDC = 200_000_000n;

/** Weekly cadence in milliseconds. */
export const CADENCE_MS = 7 * 24 * 60 * 60 * 1000;

/** Default tick interval (5 minutes). */
export const DEFAULT_TICK_MS = 300_000;

export type ChainId = 8453 | 84532;

export interface SweeperConfig {
  rpcUrl: string;
  chainId: ChainId;
  agentWalletPrivateKey: `0x${string}`;
  usdcAddress: `0x${string}`;
  pgUrl: string;
  ntfyOpsUrl: string;
  ntfyCritUrl: string;
  tickMs: number;
}

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v === '') {
    throw new Error(`grey-sweeper: missing required env var ${key}`);
  }
  return v;
}

function parseChainId(raw: string): ChainId {
  if (raw === '8453') return 8453;
  if (raw === '84532') return 84532;
  throw new Error(`grey-sweeper: GREY_SWEEPER_CHAIN_ID must be 8453 or 84532, got "${raw}"`);
}

function parseTickMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_TICK_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`grey-sweeper: GREY_SWEEPER_TICK_MS must be a positive number, got "${raw}"`);
  }
  return Math.floor(n);
}

function asHex(value: string, key: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`grey-sweeper: ${key} must be a 0x-prefixed hex string`);
  }
  return value as `0x${string}`;
}

/**
 * Load sweeper config from the environment. The sweep DESTINATION is NEVER read
 * from env — it is the source literal {@link BASE_POOL_WALLET_ADDRESS}.
 */
export function loadConfig(env: Env = process.env): SweeperConfig {
  return {
    rpcUrl: required(env, 'GREY_SWEEPER_RPC_URL'),
    chainId: parseChainId(required(env, 'GREY_SWEEPER_CHAIN_ID')),
    agentWalletPrivateKey: asHex(
      required(env, 'GREY_AGENT_WALLET_PRIVATE_KEY'),
      'GREY_AGENT_WALLET_PRIVATE_KEY',
    ),
    usdcAddress: asHex(required(env, 'GREY_USDC_ADDRESS'), 'GREY_USDC_ADDRESS'),
    pgUrl: required(env, 'GREY_PG_URL'),
    ntfyOpsUrl: required(env, 'GREY_NTFY_OPS_URL'),
    ntfyCritUrl: required(env, 'GREY_NTFY_CRIT_URL'),
    tickMs: parseTickMs(env['GREY_SWEEPER_TICK_MS']),
  };
}
