import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import type { Address } from 'viem';
import { poolWalletFor } from './config.js';
import type { ChainId } from './config.js';
import { readUsdcBalance } from './balance.js';
import type { PublicClientLike as BalanceClient } from './balance.js';
import { executeSweep } from './sweep.js';
import type { ReceiptClientLike, WalletClientLike } from './sweep.js';
import { shouldSweep } from './trigger.js';
import { appendSweepLog, getLastSweepTimestamp } from './log.js';
import type { PoolLike } from './log.js';
import { alertCritical, alertOperational } from './alert.js';
import type { AlertDeps } from './alert.js';
import { errorClass, isRecoverable } from './errors.js';
import { runRefuel } from './refuel/index.js';
import type { RefuelDeps } from './refuel/index.js';
import type { RefuelSettings } from './refuel/settings.js';

export * from './config.js';
export * from './errors.js';
export { shouldSweep } from './trigger.js';
export { readUsdcBalance } from './balance.js';
export { encodeUsdcTransfer, executeSweep } from './sweep.js';
export { appendSweepLog, getLastSweepTimestamp } from './log.js';
export { alertCritical, alertOperational } from './alert.js';

export interface TickDeps {
  balanceClient: BalanceClient;
  walletClient: WalletClientLike;
  receiptClient: ReceiptClientLike;
  pool: PoolLike;
  alertDeps: AlertDeps;
  agentWallet: Address;
  usdcAddress: Address;
  chainId: ChainId;
  /**
   * Phase F refuel wiring. Optional: absent (older tests / refuel-disabled
   * paths) → the tick is byte-for-byte pre-F behavior (spec §5.3).
   */
  refuel?: {
    settings: RefuelSettings;
    publicClient: RefuelDeps['publicClient'];
    walletClient: RefuelDeps['walletClient'];
  };
  /** Override for deterministic tests. */
  now?: () => number;
}

export type TickOutcome = 'swept' | 'skipped' | 'failed' | 'blocked';

/**
 * One sweep evaluation. Pure-ish: all I/O is injected via `deps`, so unit tests
 * call this directly with mocked viem/pg/alert. Never throws — classifies and
 * logs every error.
 */
export async function runTick(deps: TickDeps): Promise<TickOutcome> {
  const now = (deps.now ?? Date.now)();
  const source = deps.agentWallet;
  const destination = poolWalletFor(deps.chainId) as Address;

  let balance: bigint;
  let lastSweepAt: number | null;
  try {
    balance = await readUsdcBalance(deps.balanceClient, deps.usdcAddress, deps.agentWallet);
    lastSweepAt = await getLastSweepTimestamp(deps.pool, deps.chainId);
  } catch (err) {
    await safeLog(deps, {
      txHash: null,
      amountWei: null,
      source,
      destination,
      status: 'failed',
      errorClass: errorClass(err),
      errorMsg: errMsg(err),
      chainId: deps.chainId,
    });
    await alertCritical('sweeper: failed to read balance/state', { error: errMsg(err) }, deps.alertDeps);
    return 'failed';
  }

  // Phase F (F-Q4(a)): refuel BEFORE the sweep decision — the USDC must still be
  // in the agent wallet. runRefuel never throws; EVERY outcome falls through to
  // the sweep. On an 'ok' refuel, re-read the balance (USDC was spent on ETH) so
  // the sweep decision sees reality.
  if (deps.refuel && deps.refuel.settings.enabled) {
    const outcome = await runRefuel({
      publicClient: deps.refuel.publicClient,
      walletClient: deps.refuel.walletClient,
      pool: deps.pool,
      alertDeps: deps.alertDeps,
      agent: deps.agentWallet,
      usdcAddress: deps.usdcAddress,
      agentUsdcBalance: balance,
      chainId: deps.chainId,
      settings: deps.refuel.settings,
    });
    if (outcome.status === 'ok') {
      try {
        balance = await readUsdcBalance(deps.balanceClient, deps.usdcAddress, deps.agentWallet);
      } catch {
        // Non-fatal: fall back to arithmetic (pre-refuel balance minus spend).
        balance = balance - outcome.usdcIn;
        if (balance < 0n) balance = 0n;
      }
    }
  }

  if (!shouldSweep(balance, lastSweepAt, now)) {
    await safeLog(deps, {
      txHash: null,
      amountWei: balance,
      source,
      destination,
      status: 'skipped',
      errorClass: null,
      errorMsg: null,
      chainId: deps.chainId,
    });
    return 'skipped';
  }

  // Defensive: destination MUST be the hard-coded allowlist literal for the chain.
  if (destination.toLowerCase() !== poolWalletFor(deps.chainId).toLowerCase()) {
    await alertCritical(
      'sweeper: destination does not match allowlist — refusing to broadcast',
      { destination, allowlist: poolWalletFor(deps.chainId) },
      deps.alertDeps,
    );
    await safeLog(deps, {
      txHash: null,
      amountWei: balance,
      source,
      destination,
      status: 'failed',
      errorClass: 'NonAllowlistError',
      errorMsg: 'destination != allowlist',
      chainId: deps.chainId,
    });
    return 'blocked';
  }

  try {
    const result = await executeSweep({
      walletClient: deps.walletClient,
      publicClient: deps.receiptClient,
      usdcAddress: deps.usdcAddress,
      destination,
      amount: balance,
      chainId: deps.chainId,
    });
    await safeLog(deps, {
      txHash: result.txHash,
      amountWei: result.amount,
      source,
      destination,
      status: 'ok',
      errorClass: null,
      errorMsg: null,
      chainId: deps.chainId,
    });
    await alertOperational(
      `sweeper: swept ${balance.toString()} USDC-wei → ${destination} (${result.txHash})`,
      deps.alertDeps,
    );
    return 'swept';
  } catch (err) {
    await safeLog(deps, {
      txHash: null,
      amountWei: balance,
      source,
      destination,
      status: 'failed',
      errorClass: errorClass(err),
      errorMsg: errMsg(err),
      chainId: deps.chainId,
    });
    if (isRecoverable(err)) {
      await alertOperational(
        `sweeper: recoverable error (${errorClass(err)}), will retry next tick`,
        deps.alertDeps,
      );
    } else {
      await alertCritical(`sweeper: ${errorClass(err)}`, { error: errMsg(err) }, deps.alertDeps);
    }
    return 'failed';
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function safeLog(deps: TickDeps, row: Parameters<typeof appendSweepLog>[1]): Promise<void> {
  try {
    await appendSweepLog(deps.pool, row);
  } catch (err) {
    process.stderr.write(`grey-sweeper: failed to write sweep_log row: ${errMsg(err)}\n`);
  }
}

/**
 * Thin loop wrapper. Runs {@link runTick} every `tickMs`, swallowing per-tick
 * errors so the loop never dies. Exposed for the systemd entrypoint, not tests.
 */
export async function runLoop(
  deps: TickDeps,
  tickMs: number,
  signal?: AbortSignal,
): Promise<void> {
  for (;;) {
    if (signal?.aborted) return;
    try {
      await runTick(deps);
    } catch (err) {
      process.stderr.write(`grey-sweeper: unexpected tick error: ${errMsg(err)}\n`);
    }
    try {
      await sleep(tickMs, undefined, { signal });
    } catch {
      return; // aborted
    }
  }
}
