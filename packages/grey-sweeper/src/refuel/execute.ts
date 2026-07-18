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
 *
 * FDQ-57: writes carry an EXPLICIT nonce. viem's auto-nonce re-fetches
 * eth_getTransactionCount per tx; on a load-balanced endpoint a lagging node
 * serves the pre-previous-tx nonce → the next tx collides ("replacement
 * transaction underpriced"). We fetch the nonce ONCE and increment locally.
 */
export interface RefuelWalletLike {
  writeContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    nonce?: number;
  }): Promise<Hash>;
  sendTransaction(args: { to: Address; value: bigint; nonce?: number }): Promise<Hash>;
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
  getBalance(args: { address: Address }): Promise<bigint>;
  getTransactionCount(args: { address: Address; blockTag?: 'pending' | 'latest' }): Promise<number>;
}

/**
 * FDQ-55 C (observability): step hashes completed BEFORE a later step failed, so
 * a partial execution is never logged as a clean failure with a null audit spine.
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

/** Recovery outcome for stranded WETH / native ETH (FDQ-55 B, FDQ-58). */
export type RecoverResult =
  | { recovered: false }
  | {
      recovered: true;
      unwrapTx: Hash | null;
      transferTx: Hash;
      ethDeliveredWei: bigint;
    };

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
  nonce: number,
): Promise<Hash> {
  // Simulate immediately before write: a doomed call surfaces here without
  // broadcasting (zero gas), mirroring the x402 settle posture (FDQ-40).
  // The simulation NEEDS account (the agent address) for a correct msg.sender.
  try {
    await publicClient.simulateContract(call);
  } catch (err) {
    throw new RefuelStepError(step, `simulation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // FDQ-53: the WRITE must NOT carry the bare address (that selects the
  // node-managed eth_sendTransaction path). Strip account; the wallet client
  // signs locally. FDQ-57: pass the explicit nonce.
  const { account: _simOnly, ...writeCall } = call;
  void _simOnly;
  const hash = await walletClient.writeContract({ ...writeCall, nonce });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new RefuelStepError(step, `${step} tx ${hash} reverted`);
  }
  return hash;
}

/**
 * Deliver `value` native ETH to the pinned relayer at an explicit nonce. Throws
 * RefuelStepError('transfer') on receipt failure.
 */
async function transferEth(
  publicClient: RefuelPublicLike,
  walletClient: RefuelWalletLike,
  relayer: Address,
  value: bigint,
  nonce: number,
  partial: RefuelPartial,
): Promise<Hash> {
  // Invariant #21 choke-point: EVERY value-bearing ETH send in the sweeper flows
  // through here, and every one is gated on the pinned relayer literal — a future
  // caller (or a new send site) cannot move ETH to a non-relayer address even if
  // its own top-level guard is missing.
  if (!isRelayer(relayer, RELAYER_ADDRESS)) {
    throw new NonRelayerDestinationError(
      `refusing ETH send: destination ${relayer} != pinned relayer ${RELAYER_ADDRESS}`,
    );
  }
  const transferTx = await walletClient.sendTransaction({ to: relayer, value, nonce });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  if (receipt.status !== 'success') {
    throw new RefuelStepError('transfer', `ETH transfer ${transferTx} reverted`, partial);
  }
  return transferTx;
}

/**
 * FDQ-55 B + FDQ-58 — recover stranded value. The agent holds no WETH and only a
 * gas float of ETH by design. Any WETH is orphaned swap output; any native ETH
 * ABOVE `gasReserveWei` is a recovered-but-undelivered unwrap (or excess) still
 * owed to the relayer. Unwrap any WETH, then sweep native ETH above the reserve
 * to the relayer. Explicit sequential nonce (FDQ-57). Idempotent across ticks.
 */
export async function recoverStranded(params: {
  walletClient: RefuelWalletLike;
  publicClient: RefuelPublicLike;
  agent: Address;
  chainId: number;
  gasReserveWei: bigint;
  relayer?: Address;
}): Promise<RecoverResult> {
  const { walletClient, publicClient, agent, chainId, gasReserveWei } = params;
  const relayer = params.relayer ?? RELAYER_ADDRESS;
  if (!isRelayer(relayer, RELAYER_ADDRESS)) {
    throw new NonRelayerDestinationError(
      `refusing recovery: ETH destination ${relayer} != pinned relayer ${RELAYER_ADDRESS}`,
    );
  }
  const dep = uniswapFor(chainId);
  let nonce = await publicClient.getTransactionCount({ address: agent, blockTag: 'pending' });

  // 1) unwrap any orphaned WETH → native ETH
  const wethBal = (await publicClient.readContract({
    address: dep.weth9,
    abi: weth9Abi,
    functionName: 'balanceOf',
    args: [agent],
  })) as bigint;
  let unwrapTx: Hash | null = null;
  if (wethBal > 0n) {
    unwrapTx = await writeGated(
      publicClient,
      walletClient,
      'unwrap',
      { address: dep.weth9, abi: weth9Abi, functionName: 'withdraw', args: [wethBal], account: agent },
      nonce++,
    );
  }

  // 2) sweep native ETH above the gas reserve to the relayer. A single read here
  // is fine: if it lags behind a just-mined unwrap, the remainder is swept next
  // tick (recovery is idempotent — this is a safety net, not the hot path).
  const ethBal = await publicClient.getBalance({ address: agent });
  if (ethBal <= gasReserveWei) return { recovered: false };
  const excess = ethBal - gasReserveWei;
  const transferTx = await transferEth(publicClient, walletClient, relayer, excess, nonce, {
    ...(unwrapTx ? { unwrapTx } : {}),
  });
  return { recovered: true, unwrapTx, transferTx, ethDeliveredWei: excess };
}

/**
 * Execute one refuel: approve-exact → exactInputSingle (USDC→WETH) →
 * WETH.withdraw(full received) → plain ETH transfer to the PINNED relayer
 * (invariant #21). No unlimited approvals (spec §1.3). FDQ-55 A: the post-swap
 * read retries until consistent; C: failures after the swap carry `swapTx`.
 * FDQ-57: one nonce fetch, incremented locally across the four writes.
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

  // FDQ-57: one nonce fetch for the whole sequence, incremented locally.
  let nonce = await publicClient.getTransactionCount({ address: agent, blockTag: 'pending' });

  // 1) approve exact amountIn
  await writeGated(
    publicClient,
    walletClient,
    'approve',
    { address: usdcAddress, abi: erc20Abi, functionName: 'approve', args: [dep.swapRouter02, quote.amountIn], account: agent },
    nonce++,
  );

  // 2) swap USDC → WETH (exact input, minOut enforced on-chain)
  const swapTx = await writeGated(
    publicClient,
    walletClient,
    'swap',
    {
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
    },
    nonce++,
  );

  // Past the swap: USDC has moved. ANY failure below must carry swapTx (FDQ-55 C).
  try {
    // 3) unwrap the FULL received WETH — retry-consistent read (FDQ-55 A)
    const wethBal = await readWethConsistent(publicClient, dep.weth9, agent, quote.minOut, sleep);
    if (wethBal < quote.minOut) {
      throw new RefuelStepError(
        'unwrap',
        `post-swap WETH balance ${wethBal} below minOut ${quote.minOut} after ${POST_SWAP_READ_ATTEMPTS} reads`,
      );
    }
    const unwrapTx = await writeGated(
      publicClient,
      walletClient,
      'unwrap',
      { address: dep.weth9, abi: weth9Abi, functionName: 'withdraw', args: [wethBal], account: agent },
      nonce++,
    );
    // 4) deliver exactly the unwrapped amount to the pinned relayer
    const transferTx = await transferEth(publicClient, walletClient, relayer, wethBal, nonce, {
      swapTx,
      unwrapTx,
    });
    return { swapTx, unwrapTx, transferTx, ethDeliveredWei: wethBal };
  } catch (err) {
    if (err instanceof RefuelStepError) {
      throw new RefuelStepError(err.step, err.message, { swapTx, ...err.partial });
    }
    throw err;
  }
}
