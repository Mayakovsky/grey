import { erc20Abi } from 'viem';
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

export class RefuelStepError extends Error {
  constructor(
    public readonly step: 'approve' | 'swap' | 'unwrap' | 'transfer',
    msg: string,
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
  try {
    await publicClient.simulateContract(call);
  } catch (err) {
    throw new RefuelStepError(step, `simulation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const hash = await walletClient.writeContract(call);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new RefuelStepError(step, `${step} tx ${hash} reverted`);
  }
  return hash;
}

/**
 * Execute one refuel: approve-exact → exactInputSingle (USDC→WETH, recipient =
 * agent) → WETH.withdraw(full received) → plain ETH transfer to the PINNED
 * relayer (invariant #21: destination is the source literal; a runtime guard
 * refuses anything else even if a caller passes a different address).
 *
 * No unlimited approvals — the allowance is exactly `quote.amountIn` per refuel
 * (spec §1.3; F0 recon confirmed current allowance = 0).
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
}): Promise<ExecuteRefuelResult> {
  const { walletClient, publicClient, agent, usdcAddress, chainId, quote } = params;
  const relayer = params.relayer ?? RELAYER_ADDRESS;
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

  // 3) unwrap the FULL received WETH (balance-read, not simulate-result: robust
  // to any rounding between quote and execution; agent otherwise holds no WETH)
  const wethBal = (await publicClient.readContract({
    address: dep.weth9,
    abi: weth9Abi,
    functionName: 'balanceOf',
    args: [agent],
  })) as bigint;
  if (wethBal < quote.minOut) {
    throw new RefuelStepError('unwrap', `post-swap WETH balance ${wethBal} below minOut ${quote.minOut}`);
  }
  const unwrapTx = await writeGated(publicClient, walletClient, 'unwrap', {
    address: dep.weth9,
    abi: weth9Abi,
    functionName: 'withdraw',
    args: [wethBal],
    account: agent,
  });

  // 4) deliver exactly the unwrapped amount to the pinned relayer
  const transferTx = await walletClient.sendTransaction({ to: relayer, value: wethBal });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  if (receipt.status !== 'success') {
    throw new RefuelStepError('transfer', `ETH transfer ${transferTx} reverted`);
  }

  return { swapTx, unwrapTx, transferTx, ethDeliveredWei: wethBal };
}
