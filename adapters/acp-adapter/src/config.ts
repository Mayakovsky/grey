// Fail-closed config load — mirrors grey-sweeper/x402-middleware discipline (hand-rolled, no zod).
// Any missing required env → throw → the systemd unit exits non-zero rather than running
// half-configured (the fail-fast exit that replaces plugin-acp's 2s/60s PM2-restart retry loop).
import process from 'node:process';

/** Grey's on-chain ERC-8004 DID — the unifying identity layer (Base mainnet, tokenId 58618). */
export const GREY_DID = 'did:erc8004:8453:58618';

export interface AcpAdapterConfig {
  /** The ACP seller wallet — reused across the cutover (Q6). Also the ChannelIngress receivingAddress. */
  agentWalletAddress: string;
  privyWalletId: string;
  privySignerKey: string;
  /** grey_pipeline_rw runtime credential for the shared handlers' cache reads / live compute. */
  databaseUrl: string;
  /**
   * FDQ-63 safety gate. When true, EVERY signing path (setBudget/submit/reject/nudge) is suppressed
   * at the top of the job handlers, covering hydration-fired entries — the adapter subscribes and
   * parses live traffic but signs nothing (tier-2 observe-only, safe to co-run the same wallet).
   */
  observeOnly: boolean;
  /** Delivery poll backstop cadence (ms). */
  pollIntervalMs: number;
  /** M6 C′ buyer-reputation gate config (shadow-mode by default; `blockEnabled` flips to enforce). */
  buyerGating: {
    blockEnabled: boolean;
    timeout1hSec: number;
    timeout12hSec: number;
    crossProviderCacheTtlSec: number;
  };
  /** Optional Base RPC URL for the gate's cross-provider on-chain history (B.7). Absent → cross-
   *  provider tallies stay 0 (never gated on). Not `required()` — the gate degrades gracefully. */
  baseRpcUrl?: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    throw new Error(`acp-adapter: missing required env ${key}`);
  }
  return v.trim();
}

export function loadConfig(env: Env = process.env): AcpAdapterConfig {
  const pollRaw = env.ACP_ADAPTER_POLL_INTERVAL_MS?.trim();
  const pollIntervalMs = pollRaw ? Number(pollRaw) : 30_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(`acp-adapter: ACP_ADAPTER_POLL_INTERVAL_MS must be a positive integer, got "${pollRaw}"`);
  }
  const posIntEnv = (key: string, def: number): number => {
    const raw = env[key]?.trim();
    if (!raw) return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`acp-adapter: ${key} must be a positive integer, got "${raw}"`);
    }
    return n;
  };
  const baseRpcUrl = env.BASE_RPC_URL?.trim();
  return {
    agentWalletAddress: required(env, 'ACP_AGENT_WALLET_ADDRESS'),
    privyWalletId: required(env, 'ACP_PRIVY_WALLET_ID'),
    privySignerKey: required(env, 'ACP_PRIVY_SIGNER_KEY'),
    databaseUrl: required(env, 'GREY_DATABASE_URL'),
    observeOnly: (env.ACP_ADAPTER_OBSERVE_ONLY?.trim() ?? '') === 'true',
    pollIntervalMs,
    buyerGating: {
      // Shadow-mode default (records, never blocks). Flip-to-enforce = set this env to "true".
      blockEnabled: (env.BUYER_GATING_BLOCK_ENABLED?.trim().toLowerCase() ?? '') === 'true',
      timeout1hSec: posIntEnv('BUYER_GATING_TIMEOUT_1H_SEC', 3600),
      timeout12hSec: posIntEnv('BUYER_GATING_TIMEOUT_12H_SEC', 43200),
      crossProviderCacheTtlSec: posIntEnv('CROSS_PROVIDER_CACHE_TTL_SEC', 3600),
    },
    ...(baseRpcUrl ? { baseRpcUrl } : {}),
  };
}
