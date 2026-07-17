import { erc20Abi } from 'viem';
import { setTimeout as delay } from 'node:timers/promises';
import type { Address, Hash } from 'viem';
import { swapRouter02Abi, weth9Abi } from './abi.js';
import { RELAYER_ADDRESS, POOL_FEE, uniswapFor } from './addresses.js';
import { isRelayer } from './settings.js';
import type { Quote } from './quote.js';

/**
 * Minimal execution client surfaces (injectable). Every state-changing call is
 * simulate-before-write (FDQ-40 house pattern) and receipt-gated.
 */
export interface RefuelWalletLike {
  writeContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<Hash>;
  sendTransaction(args: { to: Address; value: bigint }): Promise<Hash>;
}

export interface RefuelPublicLike {
  simulateContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    account?: Address;
  }): Promise<{ result: unknown }>;
  waitForTransactionReceipt(args: { hash: Hash }): Promise<{ status: 'success' | 'reverted' }>;
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

/**
 * FDQ-55 C (observability): step hashes completed BEFORE a later step failed, so
 * a partial execution is never logged as a clean failure with a null audit spine.
 * A swap that mined then a stale-read/unwrap/transfer failure carries `swapTx`.
 */
export interface RefuelPartial {
  swapTx?: Hash;
  unwrapTx?: Hash;
}

export class RefuelStepError extends Error {
  constructor(
    public readonly step: 'approve' | 'swap' | 'unwrap' | 'transfer',
    msg: string,
    /** What already executed on-chain when this step failed (FDQ-55 C). */
    public readonly partial: RefuelPartial = {},
  ) {
    super(msg);
    this.name = 'RefuelStepError';
  }
}

export class NonRelayerDestinationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'NonRelayerDestinationError';
  }
}

export interface ExecuteRefuelResult {
  swapTx: Hash;
  unwrapTx: Hash;
  transferTx: Hash;
  ethDeliveredWei: bigint;
}

/** Recovery outcome for stranded WETH (FDQ-55 B). */
export type RecoverResult =
  | { recovered: false }
  | { recovered: true; wethBefore: bigint; unwrapTx: Hash; transferTx: Hash; ethDeliveredWei: bigint };

/**
 * FDQ-55 A: a confirmed swap guarantees ≥ minOut WETH on-chain (amountOutMinimum
 * enforced by the router). A post-swap read below that is a lagging/load-balanced
 * node returning stale state (the id48 `balance 0` that stranded real funds), NOT
 * grounds to abandon the swapped USDC. Re-read until the balance is consistent.
 */
const POST_SWAP_READ_ATTEMPTS = 8;
const POST_SWAP_READ_DELAY_MS = 750;

async function readWethConsistent(
  publicClient: RefuelPublicLike,
  weth9: Address,
  agent: Address,
  atLeast: bigint,
  sleep: (ms: number) => Promise<void>,
): Promise<bigint> {
  let bal = 0n;
  for (let attempt = 0; attempt < POST_SWAP_READ_ATTEMPTS; attempt++) {
    bal = (await publicClient.readContract({
      address: weth9,
      abi: weth9Abi,
      functionName: 'balanceOf',
      args: [agent],
    })) as bigint;
    if (bal >= atLeast) return bal;
    if (attempt < POST_SWAP_READ_ATTEMPTS - 1) await sleep(POST_SWAP_READ_DELAY_MS);
  }
  return bal;
}

async function writeGated(
  publicClient: RefuelPublicLike,
  walletClient: RefuelWalletLike,
  step: RefuelStepError['step'],
  call: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    account: Address;
  },
): Promise<Hash> {
  // Simulate immediately before write: a doomed call surfaces here without
  // broadcasting (zero gas), mirroring the x402 settle posture (FDQ-40).
  // The simulation NEEDS account (the agent address) for a correct msg.sender.
  try {
    await publicClient.simulateContract(call);
  } catch (err) {
    throw new RefuelStepError(step, `simulation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // FDQ-53: the WRITE must NOT carry the bare address — passing account as an
  // address string makes viem treat it as a node-managed JSON-RPC account and
  // emit eth_sendTransaction, which no RPC provider supports. Stripping it makes
  // the wallet client sign LOCALLY with its configured agent account
  // (eth_sendRawTransaction), matching RefuelWalletLike's declared surface.
  const { account: _simOnly, ...writeCall } = call;
  void _simOnly;
  const hash = await walletClient.writeContract(writeCall);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new RefuelStepError(step, `${step} tx ${hash} reverted`);
  }
  return hash;
}

/**
 * Unwrap `wethAmount` WETH → ETH and deliver EXACTLY that to the pinned relayer.
 * Shared by the normal refuel tail and the FDQ-55 B recovery path. Throws
 * RefuelStepError('unwrap'|'transfer'); on a transfer failure it carries the
 * completed unwrapTx so the caller can log a truthful partial.
 */
async function deliverWeth(
  publicClient: RefuelPublicLike,
  walletClient: RefuelWalletLike,
  agent: Address,
  weth9: Address,
  relayer: Address,
  wethAmount: bigint,
): Promise<{ unwrapTx: Hash; transferTx: Hash; ethDeliveredWei: bigint }> {
  const unwrapTx = await writeGated(publicClient, walletClient, 'unwrap', {
    address: weth9,
    abi: weth9Abi,
    functionName: 'withdraw',
    args: [wethAmount],
    account: agent,
  });
  const transferTx = await walletClient.sendTransaction({ to: relayer, value: wethAmount });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  if (receipt.status !== 'success') {
    throw new RefuelStepError('transfer', `ETH transfer ${transferTx} reverted`, { unwrapTx });
  }
  return { unwrapTx, transferTx, ethDeliveredWei: wethAmount };
}

/**
 * FDQ-55 B — recover stranded WETH. The agent holds no WETH by design; any
 * balance is orphaned refuel output (a swap that mined, then a later step failed)
 * that is still owed to the relayer. Delivers the full balance and returns what
 * moved, or {recovered:false} when there is nothing to recover. Idempotent across
 * ticks — a single stale zero read here just defers recovery to the next tick.
 */
export async function recoverStrandedWeth(params: {
  walletClient: RefuelWalletLike;
  publicClient: RefuelPublicLike;
  agent: Address;
  chainId: number;
  relayer?: Address;
}): Promise<RecoverResult> {
  const { walletClient, publicClient, agent, chainId } = params;
  const relayer = params.relayer ?? RELAYER_ADDRESS;
  if (!isRelayer(relayer, RELAYER_ADDRESS)) {
    throw new NonRelayerDestinationError(
      `refusing recovery: ETH destination ${relayer} != pinned relayer ${RELAYER_ADDRESS}`,
    );
  }
  const dep = uniswapFor(chainId);
  const wethBal = (await publicClient.readContract({
    address: dep.weth9,
    abi: weth9Abi,
    functionName: 'balanceOf',
    args: [agent],
  })) as bigint;
  if (wethBal === 0n) return { recovered: false };
  const { unwrapTx, transferTx, ethDeliveredWei } = await deliverWeth(
    publicClient,
    walletClient,
    agent,
    dep.weth9,
    relayer,
    wethBal,
  );
  return { recovered: true, wethBefore: wethBal, unwrapTx, transferTx, ethDeliveredWei };
}

/**
 * Execute one refuel: approve-exact → exactInputSingle (USDC→WETH, recipient =
 * agent) → WETH.withdraw(full received) → plain ETH transfer to the PINNED
 * relayer (invariant #21: destination is the source literal; a runtime guard
 * refuses anything else even if a caller passes a different address).
 *
 * No unlimited approvals — the allowance is exactly `quote.amountIn` per refuel
 * (spec §1.3; F0 recon confirmed current allowance = 0).
 *
 * FDQ-55: the post-swap balance read retries until consistent (A), and every
 * failure after the swap mines re-throws carrying `swapTx` (C) so a partial can
 * never be logged as a clean, swap-less failure.
 */
export async function executeRefuel(params: {
  walletClient: RefuelWalletLike;
  publicClient: RefuelPublicLike;
  agent: Address;
  usdcAddress: Address;
  chainId: number;
  quote: Quote;
  /** Test seam; production callers omit it and the literal applies. */
  relayer?: Address;
  /** Test seam for the post-swap read backoff; production uses a real delay. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<ExecuteRefuelResult> {
  const { walletClient, publicClient, agent, usdcAddress, chainId, quote } = params;
  const relayer = params.relayer ?? RELAYER_ADDRESS;
  const sleep = params.sleep ?? ((ms: number) => delay(ms));
  const dep = uniswapFor(chainId);

  // Invariant #21 runtime gate — mirrors the sweep's allowlist guard exactly.
  if (!isRelayer(relayer, RELAYER_ADDRESS)) {
    throw new NonRelayerDestinationError(
      `refusing refuel: ETH destination ${relayer} != pinned relayer ${RELAYER_ADDRESS}`,
    );
  }

  // 1) approve exact amountIn
  const approveTx = await writeGated(publicClient, walletClient, 'approve', {
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [dep.swapRouter02, quote.amountIn],
    account: agent,
  });
  void approveTx; // receipt-gated above; not persisted (swap/unwrap/transfer are the audit spine)

  // 2) swap USDC → WETH (exact input, minOut enforced on-chain)
  const swapTx = await writeGated(publicClient, walletClient, 'swap', {
    address: dep.swapRouter02,
    abi: swapRouter02Abi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: usdcAddress,
        tokenOut: dep.weth9,
        fee: POOL_FEE,
        recipient: agent,
        amountIn: quote.amountIn,
        amountOutMinimum: quote.minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
    account: agent,
  });

  // Past the swap: USDC has moved. ANY failure below must carry swapTx (FDQ-55 C).
  try {
    // 3) unwrap the FULL received WETH — retry-consistent read (FDQ-55 A): a
    // confirmed swap yields ≥ minOut; a lower read is stale, not a reason to strand.
    const wethBal = await readWethConsistent(publicClient, dep.weth9, agent, quote.minOut, sleep);
    if (wethBal < quote.minOut) {
      throw new RefuelStepError(
        'unwrap',
        `post-swap WETH balance ${wethBal} below minOut ${quote.minOut} after ${POST_SWAP_READ_ATTEMPTS} reads`,
      );
    }
    // 4) unwrap + deliver exactly the unwrapped amount to the pinned relayer
    const { unwrapTx, transferTx, ethDeliveredWei } = await deliverWeth(
      publicClient,
      walletClient,
      agent,
      dep.weth9,
      relayer,
      wethBal,
    );
    return { swapTx, unwrapTx, transferTx, ethDeliveredWei };
  } catch (err) {
    if (err instanceof RefuelStepError) {
      throw new RefuelStepError(err.step, err.message, { swapTx, ...err.partial });
    }
    throw err;
  }
}
