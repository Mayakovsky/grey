// DIRECT settlement (FDQ-26) via the gas-only relayer (FDQ-31(a)): submit the buyer-signed
// EIP-3009 transferWithAuthorization to USDC, wait 1 confirmation, and require a success receipt.
// The buyer's signature fixes `to` = payTo, so the relayer structurally cannot redirect funds.
import { parseSignature, type Hex } from 'viem';
import type { X402Config, TransferAuthorization } from './types.js';
import type { PublicClientLike, WalletClientLike } from './clients.js';
import { USDC_EIP3009_ABI } from './usdc-abi.js';

export interface SettleResult {
  txHash: Hex;
}

/**
 * Broadcast settlement and gate on the receipt. Throws on submit failure OR a reverted receipt —
 * the caller treats a throw as "no settlement" and refuses to run the handler.
 */
export async function settle(
  cfg: X402Config,
  auth: TransferAuthorization,
  signature: Hex,
  clients: { wallet: WalletClientLike; publicClient: PublicClientLike },
): Promise<SettleResult> {
  const sig = parseSignature(signature);
  const v = sig.v ?? (sig.yParity === 1 ? 28n : 27n);

  const txHash = await clients.wallet.writeContract({
    address: cfg.usdc.address,
    abi: USDC_EIP3009_ABI,
    functionName: 'transferWithAuthorization',
    args: [
      auth.from,
      auth.to,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      Number(v),
      sig.r,
      sig.s,
    ],
  });

  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== 'success') {
    throw new Error(`x402: settlement reverted (${txHash})`);
  }
  return { txHash };
}
