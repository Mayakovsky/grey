import { describe, it, expect, vi } from 'vitest';
import type { Address } from 'viem';
import { readUsdcBalance } from '../../src/balance.js';
import type { PublicClientLike } from '../../src/balance.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WALLET = '0x1111111111111111111111111111111111111111' as Address;

describe('readUsdcBalance', () => {
  it('calls balanceOf with the wallet address and returns the bigint', async () => {
    const readContract = vi.fn<PublicClientLike['readContract']>(async () => 1_234_567n);
    const client: PublicClientLike = { readContract };
    const bal = await readUsdcBalance(client, USDC, WALLET);
    expect(bal).toBe(1_234_567n);
    const arg = readContract.mock.calls[0]![0];
    expect(arg.address).toBe(USDC);
    expect(arg.functionName).toBe('balanceOf');
    expect(arg.args[0]).toBe(WALLET);
  });

  it('propagates a zero balance', async () => {
    const client: PublicClientLike = { readContract: vi.fn(async () => 0n) };
    expect(await readUsdcBalance(client, USDC, WALLET)).toBe(0n);
  });
});
