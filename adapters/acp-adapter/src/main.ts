// @grey/acp-adapter production entry (systemd ExecStart → dist/main.js). Mirrors grey-sweeper's
// main.ts: fail-closed loadConfig(), build the shared handler deps + the real SDK bundle, register
// the 7 offerings, run until SIGTERM/SIGINT, then stop cleanly. Fail-fast: any missing env throws
// and the unit exits non-zero (replaces plugin-acp's 2s/60s PM2-restart retry loop).
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { offeringHandlers, createHandlerDeps } from '@grey/core';
import { PAID_SLUGS, priceUsdFor } from '@grey/x402-middleware';
import { loadConfig } from './config.js';
import { AcpAdapter } from './acpAdapter.js';
import { createRealSdkBundle } from './sdk.js';
import { createLogger } from './logger.js';

async function main(): Promise<void> {
  const log = createLogger({ component: 'acp-adapter' });
  const config = loadConfig(); // fail-closed on any missing env

  // Shared grey-core handlers + deps — the WHOLE point (reuse, don't rebuild). createHandlerDeps
  // opens the grey_pipeline_rw pool + the discovery/pipeline bundle used by the cache-miss path.
  const deps = createHandlerDeps({ databaseUrl: config.databaseUrl });
  const sdk = await createRealSdkBundle();

  const adapter = new AcpAdapter({
    config,
    sdk,
    deps,
    handlers: offeringHandlers,
    logger: log,
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
        .finally(() => resolve());
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
