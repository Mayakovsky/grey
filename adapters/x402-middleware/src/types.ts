// @grey/x402-middleware — shared types for the x402 `exact`-scheme sell-side gate.
import type { Address, Hex } from 'viem';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';

export type X402Network = 'eip155:8453' | 'eip155:84532';

/** Per-network USDC asset. The EIP-712 domain name/version MUST match the on-chain token
 *  or buyer signatures won't validate at settlement. */
export interface UsdcAsset {
  address: Address;
  name: string;
  version: string;
  decimals: 6;
}

/** CDP Facilitator Phase 2: `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`, present only when BOTH are set
 *  in the environment (loadX402Config fails closed if only one is set — see config.ts). Consumed
 *  by cdpFacilitator.ts to build a `@coinbase/x402` facilitator config; never read anywhere else. */
export interface X402CdpConfig {
  apiKeyId: string;
  apiKeySecret: string;
}

export interface X402Config {
  /** Receiver address (Tier-A hot wallet). Buyer signs `to` = this; relayer cannot redirect. */
  payTo: Address;
  network: X402Network;
  chainId: number;
  rpcUrl: string;
  /** Optional fallback RPC (Phase F nit 3): tried when the primary errors. Absent/null → chain-matched public default. */
  rpcUrlFallback?: string | null;
  /** Gas-only relayer EOA (FDQ-31(a)). Referenced ONLY here — never in grey-core (invariant #19). */
  relayerPrivateKey: Hex;
  maxTimeoutSeconds: number;
  usdc: UsdcAsset;
  /** CDP Facilitator Phase 2: null when CDP routing isn't configured (the primary self-hosted
   *  relayer path — makeX402PreHandler/makeTrustRungPreHandler — never reads this field and works
   *  identically either way). The CDP-routed parallel path (cdpFacilitator.ts) fails closed —
   *  throws a clear error — if invoked while this is null, rather than silently no-op'ing. */
  cdp: X402CdpConfig | null;
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

/**
 * CDP's canonical Bazaar discovery extension shape (CDP/Bazaar alignment Phase 1, Task 3).
 *
 * UNCERTAINTY, documented rather than hidden: CDP's public docs (docs.cdp.coinbase.com/x402/bazaar,
 * checked 2026-08-02) describe `bazaar.info.{input,output}` + `bazaar.schema` but do not publish a
 * complete worked JSON example of the surrounding `extensions` envelope — specifically, whether
 * `extensions` sits at the top of the PaymentRequirements body (sibling to `x402Version`/`accepts`)
 * or inside each `accepts[]` entry is not shown in a full example anywhere found (docs, the x402
 * gitbook, or the coinbase/x402 GitHub repo's visible structure). Placed at the TOP LEVEL here —
 * the more spec-consistent reading, since discovery metadata describes the RESOURCE, not a specific
 * payment option, and matches the docs' own description of it as "top-level". This is Grey's best
 * good-faith mapping from EvaluationKitEntry, not independently verified against a live
 * CDP-indexed endpoint — Grey has no CDP API keys yet (Phase 2). Re-verify against the real
 * facilitator once keys exist, before treating this shape as load-bearing.
 */
export interface CdpBazaarExtension {
  bazaar: {
    info: {
      input: { type: 'http'; method: 'GET' | 'POST'; bodyType?: 'json' };
      output?: { example?: unknown };
    };
    /** A meta-schema describing `info` itself — `{type:'object', properties:{input:
     *  <EvaluationKitEntry.inputSchema>, output:{...}}, required:['input']}` — NOT the raw
     *  request-body schema directly. See buildCdpBazaarExtension's doc comment (challenge.ts) for
     *  why: CDP validates `info` against `schema`, so `schema` must describe `info`'s own shape. */
    schema: object | null;
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
    /** EIP-712 domain hints the buyer needs to sign the authorization, plus (E1-B) the Bazaar
     *  discovery metadata projected from @grey/schemas/evaluationKit — "on every x402 route".
     *  Grey's own shape — kept alongside `extensions.bazaar` below (Task 3), not replaced by it;
     *  other consumers may already read this field. Flag before removing, don't drop unilaterally. */
    extra: {
      name: string;
      version: string;
      bazaar: Pick<
        EvaluationKitEntry,
        | 'discoverable'
        | 'serviceName'
        | 'tags'
        | 'description'
        | 'inputSchema'
        | 'outputSchema'
        | 'iconUrl'
      >;
    };
  }>;
  /** CDP's canonical wire shape (Task 3) — top-level, see CdpBazaarExtension's own doc comment
   *  for the placement uncertainty this represents Grey's best-effort resolution of. */
  extensions?: CdpBazaarExtension;
  error?: string;
}
