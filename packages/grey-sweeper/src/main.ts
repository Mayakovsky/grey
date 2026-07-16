// @grey/sweeper production entry (systemd ExecStart → dist/main.js). NOT the sweep logic —
// that's runTick/runLoop in index.ts. This wires real deps from env and runs the loop until a
// SIGTERM/SIGINT aborts it, then closes the pool cleanly. Fail-closed: loadConfig throws on any
// missing env, so the unit exits non-zero rather than running half-configured.
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, fallback, http, defineChain } from 'viem';
import pg from 'pg';
import { loadConfig } from './config.js';
import { loadAgentAccount } from './wallet.js';
import { runLoop, type TickDeps } from './index.js';
import { loadRefuelSettings } from './refuel/settings.js';

const { Pool } = pg;

function buildChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** Chain-matched public fallback when GREY_SWEEPER_RPC_URL_FALLBACK is unset. */
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
  // Phase F nit 3 (platform-death rail): keyed primary → public fallback. A dead
  // or rate-limited primary degrades to the backup instead of failing the tick.
  const transport = fallback([
    http(config.rpcUrl),
    http(config.rpcUrlFallback ?? defaultFallbackRpc(config.chainId)),
  ]);
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
    process.stderr.write(`grey-sweeper: fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
