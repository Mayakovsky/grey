// Thin viem wrapper around the Base Mech Marketplace contract (read-side + the one write path
// this adapter can legitimately reach today — deliverMarketplace). Registration (create/
// createMech) is deliberately NOT wired here — see mechAdapter.ts's registerAsMech doc comment.
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { MARKETPLACE_ADDRESSES } from './config.js';
import { MECH_MARKETPLACE_ABI } from './marketplaceAbi.js';

export interface MarketplaceClient {
  numMechs(): Promise<bigint>;
  /** Per `checkMech(address) -> address` in the real ABI. Exact semantics (mech's own address
   *  vs. zero-address vs. something else on a non-mech) are NOT independently confirmed here —
   *  the fork test (test/fork/marketplaceRead.fork.test.ts) calls this against a known
   *  non-registered address and records the actual return value rather than assuming one. */
  checkMech(mech: Address): Promise<Address>;
  getRequestStatus(requestId: `0x${string}`): Promise<number>;
}

export function createMarketplaceClient(rpcUrl: string): MarketplaceClient {
  // No explicit `PublicClient` return-type annotation on `client` — viem's generic PublicClient
  // type and the Base-chain-specific client createPublicClient({chain: base}) actually returns
  // are structurally incompatible (Base's OP-stack deposit-transaction formatter isn't part of
  // the generic type), so let inference carry the real (correct) type through instead.
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const address = MARKETPLACE_ADDRESSES.mechMarketplaceProxy;

  return {
    async numMechs() {
      return client.readContract({ address, abi: MECH_MARKETPLACE_ABI, functionName: 'numMechs' });
    },
    async checkMech(mech: Address) {
      return client.readContract({ address, abi: MECH_MARKETPLACE_ABI, functionName: 'checkMech', args: [mech] });
    },
    async getRequestStatus(requestId: `0x${string}`) {
      return client.readContract({
        address,
        abi: MECH_MARKETPLACE_ABI,
        functionName: 'getRequestStatus',
        args: [requestId],
      });
    },
  };
}
