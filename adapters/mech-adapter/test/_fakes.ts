// Test doubles for the mech adapter — a fake MarketplaceClient (no real RPC), no network calls.
import type { Address } from 'viem';
import type { MarketplaceClient } from '../src/marketplaceClient.js';

export function fakeMarketplaceClient(overrides: Partial<MarketplaceClient> = {}): MarketplaceClient {
  return {
    numMechs: async () => 0n,
    checkMech: async (_mech: Address) => '0x0000000000000000000000000000000000000000' as Address,
    getRequestStatus: async (_id) => 0,
    ...overrides,
  };
}

export const FAKE_PAY_TO = '0x1111111111111111111111111111111111111111' as Address;
export const FAKE_POOL = '0x2222222222222222222222222222222222222222' as Address;
