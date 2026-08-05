// @grey/sweeper production entry (systemd ExecStart → dist/main.js). NOT the sweep logic —
// that's runTick/runLoop in index.ts. This wires real deps from env and runs the loop until a
// SIGTERM/SIGINT aborts it, then closes the pool cleanly. Fail-closed: loadConfig throws on any
// missing env, so the unit exits non-zero rather than running half-configured.
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, fallback, http, defineChain } from 'viem';
import pg from 'pg';
import { loadConfig, type ChainId } from './config.js';
import { loadAgentAccount } from './wallet.js';
import { runLoop, type TickDeps } from './index.js';
import { loadRefuelSettings } from './refuel/settings.js';
import { logError } from './errors.js';

const { Pool } = pg;

/**
 * E2-BE correctness fix: `buildChain` previously hardcoded `{name:'Ether',symbol:'ETH'}`
 * unconditionally — harmless while only Base (native ETH) existed, but simply wrong once
 * chainId can be 2366 (Kite mainnet, native token KITE — confirmed live against
 * docs.gokite.ai/kite-chain/1-getting-started/network-information). Keyed by the same
 * `ChainId` union `loadConfig` already validates against, so an unhandled chain is a
 * compile error here, not a silent wrong-label at runtime.
 */
const NATIVE_CURRENCY_BY_CHAIN_ID: Record<ChainId, { name: string; symbol: string; decimals: 18 }> = {
  8453: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  84532: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  2366: { name: 'KITE', symbol: 'KITE', decimals: 18 },
};

function buildChain(chainId: ChainId, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: NATIVE_CURRENCY_BY_CHAIN_ID[chainId],
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/**
 * Chain-matched PUBLIC Base RPC. As of FDQ-55 D this is NO LONGER auto-wired as a
 * fallback (a public node rejected the swap broadcast and laundered the primary
 * error); retained as a documented reference an operator could set explicitly via
 * GREY_SWEEPER_RPC_URL_FALLBACK if they accept the write-path caveat.
 */
export function defaultFallbackRpc(chainId: number): string {
  return chainId === 84532 ? 'https://sepolia.base.org' : 'https://mainnet.base.org';
}

/**
 * FDQ-46-B: strip `sslmode` (and legacy `ssl`) from the connection string IN CODE
 * so pg's config precedence (URL beats the ssl object) can never reintroduce
 * verify-full against the Supabase pooler's self-signed cert. The explicit ssl
 * object below is now the single source of SSL posture, regardless of how the
 * env URL is written. Exported for unit tests.
 */
export function stripSslParams(pgUrl: string): string {
  try {
    const u = new URL(pgUrl);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    return u.toString();
  } catch {
    // Non-URL-parseable strings pass through untouched; pg will fail loudly.
    return pgUrl;
  }
}

/**
 * Wire SIGTERM/SIGINT → abort the sweep loop (main then drains the pool after runLoop returns).
 * Extracted + injectable so the signal→abort ordering is unit-testable without real signals.
 * Idempotent: a second signal during shutdown is ignored.
 */
export function installSignalAbort(deps: {
  controller: AbortController;
  on: (sig: 'SIGTERM' | 'SIGINT', cb: () => void) => void;
  log?: (msg: string) => void;
}): void {
  let aborted = false;
  const handler = (sig: string) => (): void => {
    if (aborted) return;
    aborted = true;
    deps.log?.(`grey-sweeper: ${sig} received — aborting sweep loop, draining`);
    deps.controller.abort();
  };
  deps.on('SIGTERM', handler('SIGTERM'));
  deps.on('SIGINT', handler('SIGINT'));
}

async function main(): Promise<void> {
  const config = loadConfig(); // fail-closed on any missing env
  const refuelSettings = loadRefuelSettings(); // fail-closed on malformed refuel env
  const account = loadAgentAccount(config.agentWalletPrivateKey);
  const chain = buildChain(config.chainId, config.rpcUrl);
  // FDQ-55 D: the keyed primary is AUTHORITATIVE for writes. A fallback is added
  // ONLY when a second endpoint is explicitly configured (GREY_SWEEPER_RPC_URL_
  // FALLBACK, expected keyed). We NO LONGER silently inject a public node: the
  // public Base RPC rejected eth_sendRawTransaction (the swap-broadcast failures)
  // and viem's fallback laundered the real primary error behind the public one. A
  // single transport surfaces the true error; transient primary blips are absorbed
  // by viem's per-transport retry + the FDQ-55 A read-consistency loop.
  const transport = config.rpcUrlFallback
    ? fallback([http(config.rpcUrl), http(config.rpcUrlFallback)])
    : http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  // FDQ-44/46: SSL posture lives HERE, and stripSslParams guarantees the URL
  // cannot override it (pg merges URL params over this object otherwise).
  // rejectUnauthorized:false = encrypted, cert unverified — the documented
  // Supabase pooler posture, matching grey-core's postgres-js connection.
  const pool = new Pool({
    connectionString: stripSslParams(config.pgUrl),
    ssl: { rejectUnauthorized: false },
  });

  const deps: TickDeps = {
    balanceClient: publicClient as unknown as TickDeps['balanceClient'],
    walletClient: walletClient as unknown as TickDeps['walletClient'],
    receiptClient: publicClient as unknown as TickDeps['receiptClient'],
    pool: pool as unknown as TickDeps['pool'],
    alertDeps: {
      opsUrl: config.ntfyOpsUrl,
      critUrl: config.ntfyCritUrl,
      user: config.ntfyUser,
      pass: config.ntfyPass,
    },
    agentWallet: account.address,
    usdcAddress: config.usdcAddress,
    chainId: config.chainId,
    // Phase F: same clients serve the refuel surfaces (viem public/wallet clients
    // structurally satisfy RefuelPublicLike/QuoteClientLike/BalanceReaderLike and
    // RefuelWalletLike). Disable via GREY_REFUEL_ENABLED=false → tick is pre-F.
    refuel: {
      settings: refuelSettings,
      publicClient: publicClient as unknown as NonNullable<TickDeps['refuel']>['publicClient'],
      walletClient: walletClient as unknown as NonNullable<TickDeps['refuel']>['walletClient'],
    },
  };

  const controller = new AbortController();
  installSignalAbort({
    controller,
    on: (sig, cb) => process.on(sig, cb),
    log: (msg) => process.stderr.write(`${msg}\n`),
  });

  process.stderr.write(
    `grey-sweeper: starting (chainId ${config.chainId}, tick ${config.tickMs}ms, agent ${account.address}, refuel ${refuelSettings.enabled ? 'on' : 'off'})\n`,
  );
  await runLoop(deps, config.tickMs, controller.signal); // returns only when the signal aborts
  await pool.end();
  process.stderr.write('grey-sweeper: pool closed, exiting cleanly\n');
  process.exit(0);
}

// Run only when executed directly (systemd), never when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    logError('grey-sweeper: fatal: ', err);
    process.exit(1);
  });
}
