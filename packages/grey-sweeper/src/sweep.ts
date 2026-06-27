import { encodeFunctionData, erc20Abi } from 'viem';
import type { Address, Hash } from 'viem';
import { BASE_POOL_WALLET_ADDRESS } from './config.js';
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
 * source literal {@link BASE_POOL_WALLET_ADDRESS} (invariant #16).
 */
export async function executeSweep(params: {
  walletClient: WalletClientLike;
  publicClient: ReceiptClientLike;
  usdcAddress: Address;
  destination: Address;
  amount: bigint;
}): Promise<SweepResult> {
  const { walletClient, publicClient, usdcAddress, destination, amount } = params;

  if (destination.toLowerCase() !== BASE_POOL_WALLET_ADDRESS.toLowerCase()) {
    throw new NonAllowlistError(
      `refusing to sweep: destination ${destination} != allowlist ${BASE_POOL_WALLET_ADDRESS}`,
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
