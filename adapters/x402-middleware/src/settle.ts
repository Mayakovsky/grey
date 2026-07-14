// DIRECT settlement (FDQ-26) via the gas-only relayer (FDQ-31(a)): submit the buyer-signed
// EIP-3009 transferWithAuthorization to USDC, wait 1 confirmation, and require a success receipt.
// The buyer's signature fixes `to` = payTo, so the relayer structurally cannot redirect funds.
//
// FDQ-40: simulate BEFORE broadcasting. A spent nonce / invalid authorization reverts in simulation
// WITHOUT broadcasting or spending relayer gas → the caller returns a clean 402 (instead of a 502
// after a wasted reverted tx, which was the pre-fix behavior on a near-instant replay). Only a
// genuine failure past simulation (RPC error / post-simulation race revert) throws (→ 502).
import { parseSignature, type Hex } from 'viem';
import type { X402Config, TransferAuthorization } from './types.js';
import type { PublicClientLike, WalletClientLike } from './clients.js';
import { USDC_EIP3009_ABI } from './usdc-abi.js';

export type SettleOutcome = { ok: true; txHash: Hex } | { ok: false; reason: string };

export async function settle(
  cfg: X402Config,
  auth: TransferAuthorization,
  signature: Hex,
  clients: { wallet: WalletClientLike; publicClient: PublicClientLike },
): Promise<SettleOutcome> {
  const sig = parseSignature(signature);
  const v = sig.v ?? (sig.yParity === 1 ? 28n : 27n);
  const call = {
    address: cfg.usdc.address,
    abi: USDC_EIP3009_ABI,
    functionName: 'transferWithAuthorization',
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, Number(v), sig.r, sig.s],
  };

  // Pre-broadcast simulation. transferWithAuthorization is msg.sender-independent (it recovers the
  // signer from the authorization), so simulating as `auth.from` yields the same revert/succeed the
  // relayer would get — a spent nonce reverts here, spending zero gas.
  try {
    await clients.publicClient.simulateContract({ ...call, account: auth.from });
  } catch {
    return { ok: false, reason: 'settlement would revert (authorization spent or invalid)' };
  }

  // Broadcast. If simulation missed a spent nonce because its RPC read was stale (a load-balanced
  // node behind head), the sequencer rejects the doomed submission here — pre-inclusion, so no gas.
  // Classify CONSERVATIVELY: only a provable EIP-3009 auth-state rejection maps to a clean 402;
  // anything ambiguous (generic revert, RPC/network fault) re-throws → 502, never masking infra.
  let txHash: Hex;
  try {
    txHash = await clients.wallet.writeContract(call);
  } catch (err) {
    if (isAuthStateRejection(err)) {
      return { ok: false, reason: 'settlement rejected: authorization spent or invalid' };
    }
    throw err;
  }

  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== 'success') {
    throw new Error(`x402: settlement reverted (${txHash})`);
  }
  return { ok: true, txHash };
}

/**
 * Conservative classifier: does a writeContract error PROVE the settlement was rejected for
 * EIP-3009 authorization state (spent nonce / bad signature) rather than an infra fault? Only
 * these map to a clean 402; anything ambiguous (generic "execution reverted", RPC/network errors)
 * stays a 502 so we never mask an infrastructure failure as a payment rejection.
 */
function isAuthStateRejection(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('authorization is used') || // FiatTokenV2: authorization is used or canceled (spent nonce)
    msg.includes('invalid signature') || // EIP-3009 signature mismatch
    msg.includes('authorization is not yet valid') ||
    msg.includes('authorization is expired')
  );
}
