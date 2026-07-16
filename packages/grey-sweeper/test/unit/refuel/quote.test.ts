import { describe, it, expect, vi } from 'vitest';
import type { Address } from 'viem';
import {
  spotWethOut,
  minOutFor,
  usdcForDeficit,
  quoteUsdcToWeth,
  QuoteOutOfBandError,
} from '../../../src/refuel/quote.js';
import type { QuoteClientLike } from '../../../src/refuel/quote.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address;
const Q96 = 2n ** 96n;

// sqrtPriceX96 = 2^96 → price (token1 per token0) = 1: out == in, both orderings.
// sqrtPriceX96 = 2^97 → price = 4: wethIsToken0 → out = in/4; else out = in*4.

describe('spotWethOut — X96 integer math', () => {
  it('price=1: out equals in for both token orderings', () => {
    expect(spotWethOut(1_000_000n, Q96, true)).toBe(1_000_000n);
    expect(spotWethOut(1_000_000n, Q96, false)).toBe(1_000_000n);
  });

  it('price=4 (sqrtP=2^97): weth-as-token0 divides, weth-as-token1 multiplies', () => {
    expect(spotWethOut(1_000_000n, 2n * Q96, true)).toBe(250_000n);
    expect(spotWethOut(1_000_000n, 2n * Q96, false)).toBe(4_000_000n);
  });

  it('zero price yields zero (no division blowup)', () => {
    expect(spotWethOut(1_000_000n, 0n, true)).toBe(0n);
  });
});

describe('minOutFor — invariant #22 bound', () => {
  it('applies the 1% slippage constant', () => {
    expect(minOutFor(1_000_000n)).toBe(990_000n);
  });
  it('is never zero for a nonzero quote', () => {
    expect(minOutFor(1000n)).toBeGreaterThan(0n);
  });
});

describe('usdcForDeficit — sizing with slippage pad', () => {
  it('price=1: pads the deficit by 1%', () => {
    expect(usdcForDeficit(1_000_000n, Q96, true)).toBe(1_010_000n);
    expect(usdcForDeficit(1_000_000n, Q96, false)).toBe(1_010_000n);
  });
  it('rounds up (never undersizes by truncation)', () => {
    // deficit 1 at price 1 → raw ceil = 1, padded = 1 (1*1010/1000 truncates to 1)
    expect(usdcForDeficit(1n, Q96, true)).toBeGreaterThanOrEqual(1n);
  });
});

function quoteClient(opts: { amountOut: bigint; sqrtP?: bigint; token0?: Address; pool?: Address }): QuoteClientLike {
  return {
    readContract: vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'getPool') return opts.pool ?? POOL;
      if (args.functionName === 'token0') return opts.token0 ?? WETH;
      if (args.functionName === 'slot0') return [opts.sqrtP ?? Q96, 0, 0, 0, 0, 0, true] as const;
      throw new Error(`unexpected read ${args.functionName}`);
    }) as QuoteClientLike['readContract'],
    simulateContract: vi.fn(async () => ({ result: [opts.amountOut, 0n, 0, 0n] as const })),
  };
}

describe('quoteUsdcToWeth', () => {
  it('returns quote + minOut when within the spot band', async () => {
    const q = await quoteUsdcToWeth(quoteClient({ amountOut: 995_000n }), 8453, USDC, 1_000_000n);
    expect(q.amountOut).toBe(995_000n);
    expect(q.minOut).toBe(985_050n);
    expect(q.pool).toBe(POOL);
  });

  it('throws QuoteOutOfBandError when the quote is below the spot-derived floor', async () => {
    // spot expected 1_000_000 → floor 990_000; 980_000 is out of band
    await expect(
      quoteUsdcToWeth(quoteClient({ amountOut: 980_000n }), 8453, USDC, 1_000_000n),
    ).rejects.toBeInstanceOf(QuoteOutOfBandError);
  });

  it('fails closed when the factory returns the zero pool', async () => {
    await expect(
      quoteUsdcToWeth(
        quoteClient({ amountOut: 1n, pool: '0x0000000000000000000000000000000000000000' as Address }),
        8453,
        USDC,
        1_000_000n,
      ),
    ).rejects.toThrow(/no USDC\/WETH/);
  });

  it('fails closed on an unlisted chainId (uniswapFor)', async () => {
    await expect(quoteUsdcToWeth(quoteClient({ amountOut: 1n }), 1, USDC, 1_000_000n)).rejects.toThrow(
      /no Uniswap deployment/,
    );
  });
});
