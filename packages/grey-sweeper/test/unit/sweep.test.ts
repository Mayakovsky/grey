import { describe, it, expect, vi } from 'vitest';
import { decodeFunctionData, erc20Abi } from 'viem';
import type { Address, Hash } from 'viem';
import { encodeUsdcTransfer, executeSweep } from '../../src/sweep.js';
import { BASE_POOL_WALLET_ADDRESS } from '../../src/config.js';
import { BroadcastRevertError, NonAllowlistError } from '../../src/errors.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ALLOWLIST = BASE_POOL_WALLET_ADDRESS as Address;
const TXHASH = ('0x' + 'ab'.repeat(32)) as Hash;

describe('encodeUsdcTransfer', () => {
  it('encodes an ERC-20 transfer with the right selector and args', () => {
    const data = encodeUsdcTransfer(ALLOWLIST, 123_456n);
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    expect(decoded.functionName).toBe('transfer');
    expect((decoded.args[0] as string).toLowerCase()).toBe(ALLOWLIST.toLowerCase());
    expect(decoded.args[1]).toBe(123_456n);
  });

  it('encodes a distinct amount correctly', () => {
    const data = encodeUsdcTransfer(ALLOWLIST, 200_000_000n);
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    expect(decoded.args[1]).toBe(200_000_000n);
  });
});

describe('executeSweep — allowlist enforcement', () => {
  it('refuses to broadcast when destination !== allowlist literal', async () => {
    const sendTransaction = vi.fn();
    const waitForTransactionReceipt = vi.fn();
    await expect(
      executeSweep({
        walletClient: { sendTransaction },
        publicClient: { waitForTransactionReceipt },
        usdcAddress: USDC,
        destination: '0x0000000000000000000000000000000000000bad' as Address,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(NonAllowlistError);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('broadcasts when destination === allowlist literal', async () => {
    const sendTransaction = vi.fn(async () => TXHASH);
    const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' as const }));
    const res = await executeSweep({
      walletClient: { sendTransaction },
      publicClient: { waitForTransactionReceipt },
      usdcAddress: USDC,
      destination: ALLOWLIST,
      amount: 200_000_000n,
    });
    expect(res.txHash).toBe(TXHASH);
    expect(res.destination).toBe(ALLOWLIST);
    expect(res.amount).toBe(200_000_000n);
  });
});

describe('executeSweep — tx construction', () => {
  it('sends the tx to the USDC contract with encoded transfer calldata', async () => {
    let captured: { to: Address; data: `0x${string}` } | undefined;
    const sendTransaction = vi.fn(async (args: { to: Address; data: `0x${string}` }) => {
      captured = args;
      return TXHASH;
    });
    const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' as const }));
    await executeSweep({
      walletClient: { sendTransaction },
      publicClient: { waitForTransactionReceipt },
      usdcAddress: USDC,
      destination: ALLOWLIST,
      amount: 555n,
    });
    expect(captured?.to).toBe(USDC);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: captured!.data });
    expect(decoded.functionName).toBe('transfer');
    expect((decoded.args[0] as string).toLowerCase()).toBe(ALLOWLIST.toLowerCase());
    expect(decoded.args[1]).toBe(555n);
  });

  it('throws BroadcastRevertError when receipt status is reverted', async () => {
    const sendTransaction = vi.fn(async () => TXHASH);
    const waitForTransactionReceipt = vi.fn(async () => ({ status: 'reverted' as const }));
    await expect(
      executeSweep({
        walletClient: { sendTransaction },
        publicClient: { waitForTransactionReceipt },
        usdcAddress: USDC,
        destination: ALLOWLIST,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(BroadcastRevertError);
  });
});
