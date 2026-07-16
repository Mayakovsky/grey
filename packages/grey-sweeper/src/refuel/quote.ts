import type { Address } from 'viem';
import { factoryAbi, poolAbi, quoterV2Abi } from './abi.js';
import { POOL_FEE, uniswapFor } from './addresses.js';
import { SLIPPAGE_PPT } from './settings.js';

/**
 * Minimal read/simulate client surface (injectable for tests, per house style —
 * cf. WalletClientLike in sweep.ts).
 */
export interface QuoteClientLike {
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  simulateContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    account?: Address;
  }): Promise<{ result: unknown }>;
}

const Q192 = 2n ** 192n;
const WAD = 10n ** 18n;

export interface Quote {
  /** USDC-wei in. */
  amountIn: bigint;
  /** Quoted WETH-wei out. */
  amountOut: bigint;
  /** amountOut minus the slippage bound (invariant #22: never zero on a live swap). */
  minOut: bigint;
  /** Runtime-derived pool address (never a pinned literal). */
  pool: Address;
}

export class QuoteOutOfBandError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuoteOutOfBandError';
  }
}

/**
 * Spot WETH-out for a given USDC-in from the pool's slot0 price.
 *
 * Pool token ordering is READ, not assumed: if token0 == WETH (the Base mainnet
 * case: 0x4200… < 0x8335…), price = sqrtP²/2¹⁹² is token1-per-token0
 * (USDC-wei per WETH-wei), so wethOut = usdcIn·2¹⁹²/sqrtP². If the ordering is
 * ever inverted on another deployment, the reciprocal branch handles it.
 */
export function spotWethOut(usdcIn: bigint, sqrtPriceX96: bigint, wethIsToken0: boolean): bigint {
  const p2 = sqrtPriceX96 * sqrtPriceX96;
  if (p2 === 0n) return 0n;
  return wethIsToken0 ? (usdcIn * Q192) / p2 : (usdcIn * p2) / Q192;
}

/** amountOutMinimum = quote × (1000 − SLIPPAGE_PPT)/1000. */
export function minOutFor(amountOut: bigint): bigint {
  return (amountOut * (1000n - SLIPPAGE_PPT)) / 1000n;
}

/**
 * Quote USDC→WETH via QuoterV2 (eth_call simulation), with a spot-price sanity
 * band (F-Q5 / spec §1.2): if the quote's implied price deviates from the
 * pool's slot0 spot by more than the slippage constant, throw
 * {@link QuoteOutOfBandError} — classified quote_oob upstream, retried next tick.
 */
export async function quoteUsdcToWeth(
  client: QuoteClientLike,
  chainId: number,
  usdcAddress: Address,
  amountIn: bigint,
): Promise<Quote> {
  const dep = uniswapFor(chainId);

  const pool = (await client.readContract({
    address: dep.factory,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [usdcAddress, dep.weth9, POOL_FEE],
  })) as Address;
  if (!pool || /^0x0{40}$/i.test(pool.slice(2).padStart(40, '0')) || pool === '0x0000000000000000000000000000000000000000') {
    throw new Error(`grey-sweeper refuel: factory returned no USDC/WETH ${POOL_FEE} pool on chain ${chainId}`);
  }

  const token0 = (await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: 'token0',
  })) as Address;
  const wethIsToken0 = token0.toLowerCase() === dep.weth9.toLowerCase();

  const slot0 = (await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: 'slot0',
  })) as readonly [bigint, number, number, number, number, number, boolean];
  const sqrtPriceX96 = slot0[0];

  const sim = await client.simulateContract({
    address: dep.quoterV2,
    abi: quoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: usdcAddress,
        tokenOut: dep.weth9,
        amountIn,
        fee: POOL_FEE,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const [amountOut] = sim.result as readonly [bigint, bigint, number, bigint];

  const expected = spotWethOut(amountIn, sqrtPriceX96, wethIsToken0);
  const floor = (expected * (1000n - SLIPPAGE_PPT)) / 1000n;
  if (amountOut < floor) {
    throw new QuoteOutOfBandError(
      `quote ${amountOut} below spot-derived floor ${floor} (spot expected ${expected}) — refusing this tick`,
    );
  }

  return { amountIn, amountOut, minOut: minOutFor(amountOut), pool };
}

/**
 * USDC needed to obtain `deficitWei` of ETH at spot, padded by the slippage
 * constant so the exact-input swap comfortably covers the deficit.
 * wethIsToken0 semantics as in {@link spotWethOut}.
 */
export function usdcForDeficit(deficitWei: bigint, sqrtPriceX96: bigint, wethIsToken0: boolean): bigint {
  const p2 = sqrtPriceX96 * sqrtPriceX96;
  if (p2 === 0n) return 0n;
  const raw = wethIsToken0 ? (deficitWei * p2 + Q192 - 1n) / Q192 : (deficitWei * Q192 + p2 - 1n) / p2;
  // pad by slippage so post-fee/impact output still reaches the target
  return (raw * (1000n + SLIPPAGE_PPT)) / 1000n;
}

/** Read slot0 + ordering once for sizing (shared by index.ts). */
export async function readSpot(
  client: QuoteClientLike,
  chainId: number,
  usdcAddress: Address,
): Promise<{ sqrtPriceX96: bigint; wethIsToken0: boolean; pool: Address }> {
  const dep = uniswapFor(chainId);
  const pool = (await client.readContract({
    address: dep.factory,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [usdcAddress, dep.weth9, POOL_FEE],
  })) as Address;
  const token0 = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' })) as Address;
  const slot0 = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' })) as readonly [
    bigint, number, number, number, number, number, boolean,
  ];
  return { sqrtPriceX96: slot0[0], wethIsToken0: token0.toLowerCase() === dep.weth9.toLowerCase(), pool };
}

export const WEI_PER_ETH = WAD;
