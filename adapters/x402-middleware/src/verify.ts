// X-PAYMENT decode + full verification. Never throws — every rejection is a machine-readable reason
// so the preHandler always returns a clean 402 (never a 500) on bad input.
import { recoverTypedDataAddress, getAddress, isAddress, isHex, type Address } from 'viem';
import type { X402Config, PaymentPayload, TransferAuthorization } from './types.js';
import type { PublicClientLike } from './clients.js';
import { USDC_EIP3009_ABI } from './usdc-abi.js';

export type VerifyResult =
  | { ok: true; authorization: TransferAuthorization; signature: `0x${string}` }
  | { ok: false; reason: string };

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/** Decode the base64 X-PAYMENT header and structurally validate the `exact`-scheme envelope. */
export function decodePaymentHeader(
  header: string,
): { ok: true; payload: PaymentPayload } | { ok: false; reason: string } {
  let parsed: PaymentPayload;
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as PaymentPayload;
  } catch {
    return { ok: false, reason: 'X-PAYMENT is not valid base64 JSON' };
  }
  if (parsed?.scheme !== 'exact') return { ok: false, reason: 'unsupported scheme (expected exact)' };
  const a = parsed?.payload?.authorization;
  if (!a || !isAddress(a.from) || !isAddress(a.to)) {
    return { ok: false, reason: 'malformed authorization' };
  }
  if (!isHex(parsed.payload.signature) || !isHex(a.nonce)) {
    return { ok: false, reason: 'malformed signature or nonce' };
  }
  return { ok: true, payload: parsed };
}

/**
 * Verify a decoded payment against the route price + chain state. Order is cheapest-first:
 * static checks (network/payTo/amount/window) → signature recovery → on-chain nonce state.
 */
export async function verifyPayment(
  cfg: X402Config,
  payload: PaymentPayload,
  requiredAtomic: bigint,
  publicClient: PublicClientLike,
  nowSec: bigint,
): Promise<VerifyResult> {
  if (payload.network !== cfg.network) return { ok: false, reason: 'network mismatch' };

  const a = payload.payload.authorization;
  let value: bigint;
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    value = BigInt(a.value);
    validAfter = BigInt(a.validAfter);
    validBefore = BigInt(a.validBefore);
  } catch {
    return { ok: false, reason: 'non-integer authorization fields' };
  }

  const from = getAddress(a.from);
  const to = getAddress(a.to);
  if (to !== getAddress(cfg.payTo)) return { ok: false, reason: 'payTo mismatch' };
  if (value < requiredAtomic) return { ok: false, reason: 'underpayment' };
  if (nowSec < validAfter) return { ok: false, reason: 'authorization not yet valid' };
  if (nowSec >= validBefore) return { ok: false, reason: 'authorization expired' };

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: {
        name: cfg.usdc.name,
        version: cfg.usdc.version,
        chainId: cfg.chainId,
        verifyingContract: cfg.usdc.address,
      },
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: { from, to, value, validAfter, validBefore, nonce: a.nonce },
      signature: payload.payload.signature,
    });
  } catch {
    return { ok: false, reason: 'signature recovery failed' };
  }
  if (getAddress(recovered) !== from) return { ok: false, reason: 'signature does not match from' };

  let used: boolean;
  try {
    used = (await publicClient.readContract({
      address: cfg.usdc.address,
      abi: USDC_EIP3009_ABI,
      functionName: 'authorizationState',
      args: [from, a.nonce],
    })) as boolean;
  } catch {
    return { ok: false, reason: 'could not read authorization state' };
  }
  if (used) return { ok: false, reason: 'authorization nonce already used' };

  return {
    ok: true,
    authorization: { from, to, value, validAfter, validBefore, nonce: a.nonce },
    signature: payload.payload.signature,
  };
}
