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
    lastSweepAt = await getLastSweepTimestamp(deps.pool);
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
