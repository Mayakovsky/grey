// @grey/mech-adapter production entry (systemd ExecStart -> dist/main.js, BION-DIRECTIVE-45).
// Did not exist before this directive — a real, structurally necessary gap it found: every real
// capability this package has built since D-28 (registration, D-38's signed delivery, D-43's task
// intake, D-45's own response pinning) was previously only reachable via direct class construction
// in tests/scripts (register-live.ts), never as a real unattended process. This file is that
// process. Mirrors grey-sweeper's main.ts shape (fail-closed loadConfig(), an AbortController-
// driven poll loop, clean shutdown on SIGTERM/SIGINT) more than acp-adapter's — MechAdapter's own
// pollAndRespond is a stateless fromBlock/toBlock range query with no internal cadence of its own
// (see mechAdapter.ts's file header: "cadence/production polling infra is a deployment decision"),
// same shape as grey-sweeper's runTick, not AcpAdapter's self-driving start().
//
// Ships installed-but-DISABLED (infra/systemd/grey-mech-adapter.service, Task 2) — this file being
// buildable and correct is not the same as it being live. Two more things must ALSO be true before
// any real task is ever processed for real, neither of which this file controls:
//   1. BASE_MECH_AGENT_INSTANCE holds real ETH (currently 0 — D-45's own stated precondition).
//   2. The unit is enabled + started (a separate, later, explicit Forces act — see the runbook,
//      EXPANSION-E3-B1-MECH-GO-LIVE-RUNBOOK-FORCES.md).
// Until then, config.observeOnly (default true) keeps every write path — including deliverSigned,
// reached via pollAndRespond — simulate-only regardless of whether this process happens to be
// running at all.
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { offeringHandlers, createHandlerDeps } from '@grey/core';
import {
  loadConfig,
  loadPollIntervalMs,
  MARKETPLACE_ADDRESSES,
  BASE_MECH_AGENT_INSTANCE_ADDRESS,
  GREY_MECH_ADDRESS,
  GREY_MECH_MULTISIG_ADDRESS,
  GREY_MECH_REGISTERED_TOOLS,
} from './config.js';
import { loadAgentInstanceAccount, loadAgentInstancePrivateKeyFromEnv } from './agentInstanceSigner.js';
import { loadFilebaseCredentialsFromEnv } from './filebaseCredentials.js';
import { createFilebasePinner } from './responsePinner.js';
import { createSafeDeliveryClient } from './safeDeliveryClient.js';
import { mechPriceUsdFor } from './prices.js';
import { MechAdapter } from './mechAdapter.js';
import { createLogger } from './logger.js';

/** Independent-of-Filebase gateway used for post-pin verification (responsePinner.ts's own
 *  design). Env-overridable — same "an outage shouldn't require a code change" reasoning as
 *  BASE_RPC_URL_FALLBACK elsewhere in this codebase — defaults to the same gateway this adapter
 *  already trusts for request-content fetches (requestContent.ts, config.ts's own precedent). */
function loadPinVerifyGatewayUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.MECH_ADAPTER_PIN_VERIFY_GATEWAY_URL?.trim() || undefined;
}

/** Wire SIGTERM/SIGINT -> abort the poll loop (main then stops the adapter after the loop
 *  returns). Extracted so the signal->abort ordering is unit-testable without real signals —
 *  same shape as grey-sweeper's installSignalAbort (packages/grey-sweeper/src/main.ts). */
export function installSignalAbort(deps: {
  controller: AbortController;
  on: (sig: 'SIGTERM' | 'SIGINT', cb: () => void) => void;
  log?: (msg: string) => void;
}): void {
  let aborted = false;
  const handler = (sig: string) => (): void => {
    if (aborted) return;
    aborted = true;
    deps.log?.(`mech-adapter: ${sig} received — aborting poll loop`);
    deps.controller.abort();
  };
  deps.on('SIGTERM', handler('SIGTERM'));
  deps.on('SIGINT', handler('SIGINT'));
}

/** The poll loop itself — deliberately NOT a method on MechAdapter (see file header). Tracks its
 *  own fromBlock cursor, starting at the current chain head at process startup: this adapter does
 *  NOT backfill historical requests on a fresh start/restart. That's a deliberate safety choice,
 *  not an oversight — replaying an old block range after a restart risks re-routing (and re-
 *  pinning, harmlessly idempotent) a request this process, or an earlier instance of it, already
 *  answered; MarketplaceRequest's own responseTimeout means a request this process genuinely never
 *  got to during an outage is still answerable by another mech after timeout, not silently lost to
 *  the protocol. A per-request pin failure (transient Filebase/gateway trouble) is similarly NOT
 *  retried across ticks — it's isolated into pollAndRespond's routingErrors, logged, and the cursor
 *  still advances; the same responseTimeout fallback applies. This is a real, named operational
 *  limitation, not silently glossed over — see the runbook (Task 3) and BION-DIRECTIVE-45's own
 *  status report for the full reasoning.
 */
export async function runPollLoop(
  adapter: MechAdapter,
  publicClient: { getBlockNumber(): Promise<bigint> },
  mech: `0x${string}`,
  marketplaceAddress: `0x${string}`,
  registeredTools: readonly (typeof GREY_MECH_REGISTERED_TOOLS)[number][],
  tickMs: number,
  log: ReturnType<typeof createLogger>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = await publicClient.getBlockNumber();
  for (;;) {
    if (signal?.aborted) return;
    try {
      const head = await publicClient.getBlockNumber();
      if (head >= cursor) {
        const result = await adapter.pollAndRespond(mech, marketplaceAddress, cursor, head, registeredTools);
        if (result.routed.length > 0 || result.routingErrors.length > 0) {
          log.info('mech-adapter: tick complete', {
            fromBlock: cursor.toString(),
            toBlock: head.toString(),
            routed: result.routed.length,
            routingErrors: result.routingErrors.length,
            delivered: result.delivery?.success,
          });
        }
        cursor = head + 1n;
      }
    } catch (err) {
      log.error('mech-adapter: unexpected tick error', { error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await sleep(tickMs, undefined, { signal });
    } catch {
      return; // aborted
    }
  }
}

async function main(): Promise<void> {
  const log = createLogger({ component: 'mech-adapter' });
  const config = loadConfig(); // fail-closed on any missing env
  const pollIntervalMs = loadPollIntervalMs();
  const agentInstanceAccount = loadAgentInstanceAccount(loadAgentInstancePrivateKeyFromEnv());
  const filebaseCredentials = loadFilebaseCredentialsFromEnv();

  const deps = createHandlerDeps({ databaseUrl: config.databaseUrl });
  const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
  const safeDeliveryClient = createSafeDeliveryClient(config.rpcUrl, GREY_MECH_MULTISIG_ADDRESS, agentInstanceAccount);
  const responsePinner = createFilebasePinner({
    credentials: filebaseCredentials,
    gatewayBaseUrl: loadPinVerifyGatewayUrl(process.env),
  });

  const adapter = new MechAdapter({
    config: { ...config, agentInstanceAddress: BASE_MECH_AGENT_INSTANCE_ADDRESS, mechAddress: GREY_MECH_ADDRESS },
    publicClient,
    safeDeliveryClient,
    responsePinner,
    handlers: offeringHandlers,
    handlerDeps: deps,
    logger: log,
  });

  for (const slug of GREY_MECH_REGISTERED_TOOLS) {
    adapter.registerOffering({ slug, priceUsd: mechPriceUsdFor(slug) });
  }

  log.info('mech-adapter: starting', {
    observeOnly: config.observeOnly,
    mech: GREY_MECH_ADDRESS,
    multisig: GREY_MECH_MULTISIG_ADDRESS,
    agentInstance: agentInstanceAccount.address,
    pollIntervalMs,
    offerings: GREY_MECH_REGISTERED_TOOLS.length,
  });

  await adapter.start();

  const controller = new AbortController();
  installSignalAbort({
    controller,
    on: (sig, cb) => process.on(sig, cb),
    log: (msg) => log.info(msg),
  });

  await runPollLoop(
    adapter,
    publicClient,
    GREY_MECH_ADDRESS,
    MARKETPLACE_ADDRESSES.mechMarketplaceProxy,
    GREY_MECH_REGISTERED_TOOLS,
    pollIntervalMs,
    log,
    controller.signal,
  );

  await adapter.stop();
  log.info('mech-adapter: stopped cleanly');
  process.exit(0);
}

// Run only when executed directly (systemd), never when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`mech-adapter: fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  });
}
