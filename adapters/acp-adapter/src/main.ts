// @grey/acp-adapter production entry (systemd ExecStart → dist/main.js). Mirrors grey-sweeper's
// main.ts: fail-closed loadConfig(), build the shared handler deps + the real SDK bundle, register
// the 7 offerings, run until SIGTERM/SIGINT, then stop cleanly. Fail-fast: any missing env throws
// and the unit exits non-zero (replaces plugin-acp's 2s/60s PM2-restart retry loop).
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { offeringHandlers, createHandlerDeps } from '@grey/core';
import { PAID_SLUGS, priceUsdFor } from '@grey/x402-middleware';
import { loadConfig } from './config.js';
import { AcpAdapter } from './acpAdapter.js';
import { createRealSdkBundle } from './sdk.js';
import { createLogger } from './logger.js';
import { PgBuyerRecordStore, PgTrackedJobsRepo, stripSslParams } from './reputation/reputationDb.js';
import { BuyerReputationGateImpl } from './reputation/buyerReputationGate.js';
import { makeCrossProviderFetch } from './reputation/crossProvider.js';
import { ReputationReconciler } from './reputation/reputationReconciler.js';

async function main(): Promise<void> {
  const log = createLogger({ component: 'acp-adapter' });
  const config = loadConfig(); // fail-closed on any missing env

  // Shared grey-core handlers + deps — the WHOLE point (reuse, don't rebuild). createHandlerDeps
  // opens the grey_pipeline_rw pool + the discovery/pipeline bundle used by the cache-miss path.
  const deps = createHandlerDeps({ databaseUrl: config.databaseUrl });
  const sdk = await createRealSdkBundle();

  // M6 C′ — buyer-reputation gate, wired to the Phase B grey_two tables via a dedicated pg pool
  // (grey_pipeline_rw; SELECT/INSERT/UPDATE only — FDQ-65). Shadow-mode by default
  // (BUYER_GATING_BLOCK_ENABLED=false → records, never blocks; fail-open on any DB error). A small
  // pool (max 3) keeps the memory-tight VPS light; the cache-read handlers keep their own pool.
  const gatePool = new pg.Pool({
    connectionString: stripSslParams(config.databaseUrl),
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  const trackedRepo = new PgTrackedJobsRepo(gatePool);
  const reputationGate = new BuyerReputationGateImpl({
    buyerStore: new PgBuyerRecordStore(gatePool),
    trackedRepo,
    gating: config.buyerGating,
    logger: log.child({ subsystem: 'reputation' }),
    crossProviderFetch: makeCrossProviderFetch(config.baseRpcUrl),
  });
  // FDQ-73 — reconciliation sweep for stranded submitted jobs (SDK never delivers job.expired/
  // rejected). Shares the gate's trackedRepo + idempotent onJobTerminal; runs on the poll cadence.
  const reputationReconciler = new ReputationReconciler({
    trackedRepo,
    onTerminal: (jobId, chainId, terminal) => reputationGate.onJobTerminal(jobId, chainId, terminal),
    logger: log.child({ subsystem: 'reconcile' }),
  });

  const adapter = new AcpAdapter({
    config,
    sdk,
    deps,
    handlers: offeringHandlers,
    logger: log,
    reputationGate,
    reputationReconciler,
  });

  // Register the 7 paid offerings from the single price source (invariant #20), BEFORE start() —
  // no boot-buffer needed (one process; no cross-plugin registration race).
  for (const slug of PAID_SLUGS) {
    adapter.registerOffering({ slug, priceUsd: priceUsdFor(slug) });
  }

  log.info('acp-adapter: starting', {
    observeOnly: config.observeOnly,
    receivingAddress: config.agentWalletAddress,
    offerings: PAID_SLUGS.length,
    reputationGate: config.buyerGating.blockEnabled ? 'enforcing' : 'shadow',
    crossProvider: config.baseRpcUrl ? 'enabled' : 'disabled',
  });

  await adapter.start();

  // Run until a signal aborts; then stop cleanly. A ref'd poll timer keeps the loop alive.
  await new Promise<void>((resolve) => {
    let stopping = false;
    const shutdown = (sig: string): void => {
      if (stopping) return;
      stopping = true;
      log.info(`acp-adapter: ${sig} received — stopping`);
      adapter
        .stop()
        .then(() => log.info('acp-adapter: stopped cleanly'))
        .catch((err: unknown) =>
          log.error('acp-adapter: error during stop', {
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        .finally(() => {
          void gatePool.end().catch(() => {
            /* best-effort pool close on shutdown */
          });
          resolve();
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });

  process.exit(0);
}

// Run only when executed directly (systemd), never when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `acp-adapter: fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  });
}
