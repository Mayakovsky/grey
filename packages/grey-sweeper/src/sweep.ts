import { encodeFunctionData, erc20Abi } from 'viem';
import type { Address, Hash } from 'viem';
import { poolWalletFor } from './config.js';
import { BroadcastRevertError, NonAllowlistError } from './errors.js';

/** Encoded `transfer(to, amount)` calldata for an ERC-20 USDC move. */
export function encodeUsdcTransfer(to: Address, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  });
}

/**
 * Minimal wallet-client surface — tests inject a mock that records the sent tx.
 */
export interface WalletClientLike {
  sendTransaction(args: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<Hash>;
}

/** Minimal public-client surface for receipt confirmation. */
export interface ReceiptClientLike {
  waitForTransactionReceipt(args: { hash: Hash }): Promise<{ status: 'success' | 'reverted' }>;
}

export interface SweepResult {
  txHash: Hash;
  amount: bigint;
  destination: Address;
}

/**
 * Construct, sign, and broadcast a USDC `transfer` to the hard-coded pool wallet.
 *
 * Defensive allowlist guard: refuses to broadcast unless `destination` is the
 * source literal for `chainId` ({@link poolWalletFor}, invariant #16). An
 * unlisted chainId throws (fail-closed) — never routes to mainnet by default.
 */
export async function executeSweep(params: {
  walletClient: WalletClientLike;
  publicClient: ReceiptClientLike;
  usdcAddress: Address;
  destination: Address;
  amount: bigint;
  chainId: number;
}): Promise<SweepResult> {
  const { walletClient, publicClient, usdcAddress, destination, amount, chainId } = params;

  const allowlisted = poolWalletFor(chainId);
  if (destination.toLowerCase() !== allowlisted.toLowerCase()) {
    throw new NonAllowlistError(
      `refusing to sweep: destination ${destination} != allowlist ${allowlisted} for chainId ${chainId}`,
    );
  }

  const data = encodeUsdcTransfer(destination, amount);
  const txHash = await walletClient.sendTransaction({ to: usdcAddress, data });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new BroadcastRevertError(`sweep ${txHash} reverted`);
  }

  return { txHash, amount, destination };
}
