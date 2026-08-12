// @grey/mech-adapter — the Olas Mech Marketplace (Base) as a ChannelIngress (e3-b1). Package
// surface for reuse/tests.
export { MechAdapter } from './mechAdapter.js';
export type { MechAdapterOptions } from './mechAdapter.js';
export {
  loadConfig,
  loadPollIntervalMs,
  GREY_DID,
  MARKETPLACE_ADDRESSES,
  BASE_MECH_PAY_TO_ADDRESS,
  BASE_MECH_POOL_WALLET_ADDRESS,
} from './config.js';
export type { MechAdapterConfig, MechPaymentType } from './config.js';
export { createMarketplaceClient } from './marketplaceClient.js';
export type { MarketplaceClient } from './marketplaceClient.js';
export { MECH_MARKETPLACE_ABI, MECH_FACTORY_ABI, REQUEST_STATUS } from './marketplaceAbi.js';
export { createLogger, silentLogger } from './logger.js';
export type { AdapterLogger } from './logger.js';
export { MECH_OFFERING_SLUGS, mechPriceUsdFor } from './prices.js';
export type { MechOfferingSlug } from './prices.js';
export { buildMechListing } from './listing.js';
export type { MechListingEntry } from './listing.js';
