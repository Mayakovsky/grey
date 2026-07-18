import type { Address } from 'viem';
import type { PoolLike } from '../log.js';
import type { AlertDeps } from '../alert.js';
import { alertCritical, alertOperational } from '../alert.js';
import { errorClass, redactError } from '../errors.js';
import { RELAYER_ADDRESS } from './addresses.js';
import {
  MIN_USDC_IN,
  type RefuelLogRow,
  type RefuelResult,
  type RefuelSettings,
} from './settings.js';
import { QuoteOutOfBandError, quoteUsdcToWeth, readSpot, usdcForDeficit } from './quote.js';
import type { QuoteClientLike } from './quote.js';
import { executeRefuel, recoverStranded, RefuelStepError } from './execute.js';
import type { RefuelPublicLike, RefuelWalletLike } from './execute.js';
import { appendRefuelLog } from './log.js';

export { RELAYER_ADDRESS, uniswapFor, POOL_FEE, UNISWAP_BY_CHAIN_ID } from './addresses.js';
export * from './settings.js';
export { quoteUsdcToWeth, readSpot, usdcForDeficit, minOutFor, spotWethOut, QuoteOutOfBandError } from './quote.js';
export { executeRefuel, RefuelStepError, NonRelayerDestinationError } from './execute.js';
export { appendRefuelLog } from './log.js';

/** ETH-balance read surface (injectable). */
export interface BalanceReaderLike {
  getBalance(args: { address: Address }): Promise<bigint>;
}

export interface RefuelDeps {
  publicClient: RefuelPublicLike & QuoteClientLike & BalanceReaderLike;
  walletClient: RefuelWalletLike;
  pool: PoolLike;
  alertDeps: AlertDeps;
  agent: Address;
  usdcAddress: Address;
  /** Agent's current USDC balance (read once by runTick; passed in to avoid a duplicate read). */
  agentUsdcBalance: bigint;
  chainId: number;
  settings: RefuelSettings;
}

/**
 * One refuel evaluation (F-Q4(a)): NEVER throws — every outcome is classified,
 * logged to grey_two.refuel_log, alerted per class, and control falls through
 * to the sweep regardless. Ordering: refuel runs BEFORE the sweep decision so
 * the USDC is still in the agent wallet.
 *
 * Outcomes:
 *  - relayer ETH ≥ floor           → 'skipped' (silent; no log row — steady-state
 *                                    ticks must not grow the table unboundedly)
 *  - disabled via settings         → 'skipped' (silent)
 *  - deficit but USDC too small    → 'insufficient_usdc' (ops alert; hard-floor may escalate)
 *  - quote outside spot band       → 'quote_oob' (ops alert; retry next tick)
 *  - any execution step fails      → 'failed' (CRIT alert)
 *  - swap+unwrap+deliver complete  → 'ok' (ops alert with amounts + txs)
 *
 * Hard-floor failsafe (spec §1.5): any non-ok outcome while relayer ETH is
 * below the hard floor escalates to a CRITICAL alert — the human-needed signal.
 */
export async function runRefuel(deps: RefuelDeps): Promise<RefuelResult> {
  if (!deps.settings.enabled) return { status: 'skipped' };

  let relayerEth: bigint;
  try {
    relayerEth = await deps.publicClient.getBalance({ address: RELAYER_ADDRESS });
  } catch (err) {
    const detail = redactError(err);
    await safeRefuelLog(deps, baseRow(deps, 0n, null, 'failed', errorClass(err), detail));
    await alertCritical('refuel: failed to read relayer balance', { error: detail }, deps.alertDeps);
    return { status: 'failed', errorClass: errorClass(err), errorDetail: detail };
  }

  // FDQ-55 B + FDQ-58: recover any stranded value BEFORE the floor decision — the
  // agent holds no WETH and only a gas float by design, so orphaned WETH (a swap
  // that mined, then a later step failed) and native ETH above the reserve (a
  // recovered-but-undelivered unwrap) are both owed to the relayer. Delivered
  // regardless of the floor; idempotent per-tick; never blocks the sweep (F-Q4(a)).
  try {
    const rec = await recoverStranded({
      walletClient: deps.walletClient,
      publicClient: deps.publicClient,
      agent: deps.agent,
      chainId: deps.chainId,
      gasReserveWei: deps.settings.gasReserveWei,
    });
    if (rec.recovered) {
      await safeRefuelLog(deps, {
        ...baseRow(deps, relayerEth, null, 'ok', null, null),
        unwrapTx: rec.unwrapTx,
        transferTx: rec.transferTx,
        ethDeliveredWei: rec.ethDeliveredWei,
      });
      await alertOperational(
        `refuel: recovered ${rec.ethDeliveredWei} wei → relayer (${rec.transferTx})`,
        deps.alertDeps,
      );
      // the delivery raised the relayer — re-read for an accurate floor decision
      relayerEth = await deps.publicClient.getBalance({ address: RELAYER_ADDRESS });
    }
  } catch (err) {
    const detail = redactError(err);
    const partial = err instanceof RefuelStepError ? err.partial : {};
    await safeRefuelLog(deps, {
      ...baseRow(deps, relayerEth, null, 'failed', errorClass(err), detail),
      unwrapTx: partial.unwrapTx ?? null,
    });
    await alertCritical('refuel: stranded-value recovery failed', { error: detail }, deps.alertDeps);
    return { status: 'failed', errorClass: errorClass(err), errorDetail: detail };
  }

  if (relayerEth >= deps.settings.floorWei) return { status: 'skipped' };

  const deficit = deps.settings.targetWei - relayerEth;
  const belowHardFloor = relayerEth < deps.settings.hardFloorWei;

  try {
    const spot = await readSpot(deps.publicClient, deps.chainId, deps.usdcAddress);
    let usdcIn = usdcForDeficit(deficit, spot.sqrtPriceX96, spot.wethIsToken0);
    if (usdcIn > deps.settings.maxUsdcPerTick) usdcIn = deps.settings.maxUsdcPerTick;
    if (usdcIn > deps.agentUsdcBalance) usdcIn = deps.agentUsdcBalance;

    if (usdcIn < MIN_USDC_IN) {
      const row = baseRow(deps, relayerEth, deficit, 'insufficient_usdc', null, null);
      await safeRefuelLog(deps, row);
      if (belowHardFloor) {
        await alertCritical(
          'refuel: relayer below HARD floor and agent USDC insufficient to refuel',
          { relayerWei: relayerEth.toString(), agentUsdc: deps.agentUsdcBalance.toString() },
          deps.alertDeps,
        );
      } else {
        await alertOperational(
          `refuel: deficit ${deficit} wei but agent USDC ${deps.agentUsdcBalance} below minimum — will retry as revenue accrues`,
          deps.alertDeps,
        );
      }
      return { status: 'insufficient_usdc' };
    }

    const quote = await quoteUsdcToWeth(deps.publicClient, deps.chainId, deps.usdcAddress, usdcIn);
    const exec = await executeRefuel({
      walletClient: deps.walletClient,
      publicClient: deps.publicClient,
      agent: deps.agent,
      usdcAddress: deps.usdcAddress,
      chainId: deps.chainId,
      quote,
    });

    await safeRefuelLog(deps, {
      ...baseRow(deps, relayerEth, deficit, 'ok', null, null),
      usdcIn: quote.amountIn,
      quoteOutWei: quote.amountOut,
      minOutWei: quote.minOut,
      swapTx: exec.swapTx,
      unwrapTx: exec.unwrapTx,
      transferTx: exec.transferTx,
      ethDeliveredWei: exec.ethDeliveredWei,
    });
    await alertOperational(
      `refuel: swapped ${quote.amountIn} USDC-wei → delivered ${exec.ethDeliveredWei} wei to relayer (${exec.transferTx})`,
      deps.alertDeps,
    );
    return {
      status: 'ok',
      usdcIn: quote.amountIn,
      ethDeliveredWei: exec.ethDeliveredWei,
      swapTx: exec.swapTx,
      unwrapTx: exec.unwrapTx,
      transferTx: exec.transferTx,
    };
  } catch (err) {
    const isOob = err instanceof QuoteOutOfBandError;
    const status = isOob ? 'quote_oob' : 'failed';
    const detail = redactError(err);
    // FDQ-55 C: a swap that mined before a later step failed MUST record its
    // swapTx — the audit row can never say "failed, swap_tx=null" while real USDC
    // moved on-chain. executeRefuel re-throws carrying the completed hashes.
    const partial = err instanceof RefuelStepError ? err.partial : {};
    await safeRefuelLog(deps, {
      ...baseRow(deps, relayerEth, deficit, status, errorClass(err), detail),
      swapTx: partial.swapTx ?? null,
      unwrapTx: partial.unwrapTx ?? null,
    });
    if (isOob && !belowHardFloor) {
      await alertOperational(`refuel: quote out of band, retrying next tick (${detail})`, deps.alertDeps);
    } else {
      await alertCritical(`refuel: ${errorClass(err)}`, { error: detail }, deps.alertDeps);
    }
    return { status, errorClass: errorClass(err), errorDetail: detail };
  }
}

function baseRow(
  deps: RefuelDeps,
  relayerEth: bigint,
  deficit: bigint | null,
  status: RefuelLogRow['status'],
  errorCls: string | null,
  errorDetail: string | null,
): RefuelLogRow {
  return {
    chainId: deps.chainId,
    relayerBalanceBeforeWei: relayerEth,
    deficitWei: deficit,
    usdcIn: null,
    quoteOutWei: null,
    minOutWei: null,
    swapTx: null,
    unwrapTx: null,
    transferTx: null,
    ethDeliveredWei: null,
    status,
    errorClass: errorCls,
    errorDetail,
  };
}

async function safeRefuelLog(deps: RefuelDeps, row: RefuelLogRow): Promise<void> {
  try {
    await appendRefuelLog(deps.pool, row);
  } catch (err) {
    process.stderr.write(`grey-sweeper: failed to write refuel_log row: ${redactError(err)}\n`);
  }
}
