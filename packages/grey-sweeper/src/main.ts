// @grey/sweeper production entry (systemd ExecStart → dist/main.js). NOT the sweep logic —
// that's runTick/runLoop in index.ts. This wires real deps from env and runs the loop until a
// SIGTERM/SIGINT aborts it, then closes the pool cleanly. Fail-closed: loadConfig throws on any
// missing env, so the unit exits non-zero rather than running half-configured.
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import pg from 'pg';
import { loadConfig } from './config.js';
import { loadAgentAccount } from './wallet.js';
import { runLoop, type TickDeps } from './index.js';

const { Pool } = pg;

function buildChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
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
  const account = loadAgentAccount(config.agentWalletPrivateKey);
  const chain = buildChain(config.chainId, config.rpcUrl);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const pool = new Pool({ connectionString: config.pgUrl });

  const deps: TickDeps = {
    balanceClient: publicClient as unknown as TickDeps['balanceClient'],
    walletClient: walletClient as unknown as TickDeps['walletClient'],
    receiptClient: publicClient as unknown as TickDeps['receiptClient'],
    pool: pool as unknown as TickDeps['pool'],
    alertDeps: { opsUrl: config.ntfyOpsUrl, critUrl: config.ntfyCritUrl },
    agentWallet: account.address,
    usdcAddress: config.usdcAddress,
    chainId: config.chainId,
  };

  const controller = new AbortController();
  installSignalAbort({
    controller,
    on: (sig, cb) => process.on(sig, cb),
    log: (msg) => process.stderr.write(`${msg}\n`),
  });

  process.stderr.write(
    `grey-sweeper: starting (chainId ${config.chainId}, tick ${config.tickMs}ms, agent ${account.address})\n`,
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
