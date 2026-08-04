// @grey/x402-middleware — sell-side x402 `exact`-scheme payment gate (Fastify).
// DIRECT settlement (FDQ-26) via a gas-only relayer (FDQ-31(a)); single price source (invariant #20).
export { loadX402Config } from './config.js';
export { NETWORK_REGISTRY, isRegisteredNetwork, networkRegistryEntry } from './registry.js';
export type { NetworkRegistryEntry } from './registry.js';
export { makeX402PreHandler, makeX402PaymentPresenceCheck, slugFromUrl } from './preHandler.js';
export type { X402PreHandlerDeps } from './preHandler.js';
export { makeRelayerClients } from './clients.js';
export type { PublicClientLike, WalletClientLike, RelayerClients } from './clients.js';
export {
  PRICE_TABLE,
  PAID_SLUGS,
  USDC_BY_NETWORK,
  priceUsdFor,
  priceAtomicFor,
  isPaidSlug,
} from './prices.js';
export type { PaidSlug } from './prices.js';
export { buildPaymentRequirements, buildCdpBazaarExtension } from './challenge.js';
export {
  TRUST_RUNG_SLUG,
  trustRungEnabled,
  trustRungPriceAtomic,
  trustRungPriceUsd,
  buildTrustRungPaymentRequirements,
  makeTrustRungPreHandler,
  makeTrustRungPaymentPresenceCheck,
} from './trustRung.js';
export { decodePaymentHeader, verifyPayment } from './verify.js';
export type { VerifyResult } from './verify.js';
export { settle } from './settle.js';
export type { SettleOutcome } from './settle.js';
export { USDC_EIP3009_ABI } from './usdc-abi.js';
export type {
  X402Config,
  X402Network,
  UsdcAsset,
  PaymentRequirements,
  PaymentPayload,
  TransferAuthorization,
  CdpBazaarExtension,
  X402CdpConfig,
} from './types.js';
export {
  cdpSlugFromUrl,
  makeCdpFacilitatorClient,
  buildCdpPaymentRequirementsEntry,
  buildCdpChallenge,
  verifyAndSettleViaCdp,
  makeCdpX402PaymentPresenceCheck,
  makeCdpX402PreHandler,
} from './cdpFacilitator.js';
export type { CdpX402PreHandlerDeps } from './cdpFacilitator.js';
