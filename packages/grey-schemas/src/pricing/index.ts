// @grey/schemas/pricing — computeClass + canonical pricing barrel (E1-A, Invariant #30/#31).
export type { ComputeClass, OfferingPricing, Channel } from './types';
export {
  PRICING_TABLE,
  NETWORK_MULTIPLIER,
  computeClassFor,
  networkMultiplierFor,
  canonicalUsdFor,
  resolvePriceUsd,
} from './table';
