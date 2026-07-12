// @grey/x402-middleware — shared types for the x402 `exact`-scheme sell-side gate.
import type { Address, Hex } from 'viem';

export type X402Network = 'eip155:8453' | 'eip155:84532';

/** Per-network USDC asset. The EIP-712 domain name/version MUST match the on-chain token
 *  or buyer signatures won't validate at settlement. */
export interface UsdcAsset {
  address: Address;
  name: string;
  version: string;
  decimals: 6;
}

export interface X402Config {
  /** Receiver address (Tier-A hot wallet). Buyer signs `to` = this; relayer cannot redirect. */
  payTo: Address;
  network: X402Network;
  chainId: number;
  rpcUrl: string;
  /** Gas-only relayer EOA (FDQ-31(a)). Referenced ONLY here — never in grey-core (invariant #19). */
  relayerPrivateKey: Hex;
  maxTimeoutSeconds: number;
  usdc: UsdcAsset;
}

/** EIP-3009 authorization the buyer signs (x402 `exact`, EVM). */
export interface TransferAuthorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

/** Decoded X-PAYMENT header (x402 `exact` scheme). Authorization fields arrive as strings. */
export interface PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: X402Network;
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
}

/** 402 body — strict-canonical x402 `PaymentRequirements` (Forces ruling: maxTimeoutSeconds only,
 *  no server nonce/expiresAt; the buyer chooses the EIP-3009 nonce). */
export interface PaymentRequirements {
  x402Version: number;
  accepts: Array<{
    scheme: 'exact';
    network: X402Network;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: 'application/json';
    payTo: Address;
    maxTimeoutSeconds: number;
    asset: Address;
    /** EIP-712 domain hints the buyer needs to sign the authorization. */
    extra: { name: string; version: string };
  }>;
  error?: string;
}
