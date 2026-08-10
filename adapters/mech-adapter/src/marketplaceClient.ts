// Thin viem wrapper around the Base Mech Marketplace contract — read-side (always available) plus
// the createMech write path (BION-DIRECTIVE-28), which needs a signing `account` and is therefore
// only reachable when the client is constructed with one. MechAdapter's own default construction
// (`createMarketplaceClient(rpcUrl)`, no account) stays read-only-safe; a real deployment wanting
// registerAsMech to work injects a client built with an account instead (same injection pattern
// serviceRegistryClient.ts already uses).
import { createPublicClient, createWalletClient, http, type Address, type Account, type Hash } from 'viem';
import { base } from 'viem/chains';
import { MARKETPLACE_ADDRESSES, SERVICE_REGISTRY_ADDRESSES } from './config.js';
import { MECH_FACTORY_ABI, MECH_MARKETPLACE_ABI } from './marketplaceAbi.js';

export interface MarketplaceClient {
  numMechs(): Promise<bigint>;
  /** Per `checkMech(address) -> address` in the real ABI. Exact semantics (mech's own address
   *  vs. zero-address vs. something else on a non-mech) are NOT independently confirmed here —
   *  the fork test (test/fork/marketplaceRead.fork.test.ts) calls this against a known
   *  non-registered address and records the actual return value rather than assuming one. */
  checkMech(mech: Address): Promise<Address>;
  getRequestStatus(requestId: `0x${string}`): Promise<number>;

  /** `serviceRegistry` is fixed to SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2 — not a parameter,
   *  since this client only ever points at the one registry mechAdapter.ts's registerAsMech
   *  registers services against. Throws if the client was constructed without an account. */
  simulateCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`): Promise<Address>;
  executeCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`): Promise<Address>;
}

export function createMarketplaceClient(rpcUrl: string, account?: Account): MarketplaceClient {
  // No explicit `PublicClient` return-type annotation on `client` — viem's generic PublicClient
  // type and the Base-chain-specific client createPublicClient({chain: base}) actually returns
  // are structurally incompatible (Base's OP-stack deposit-transaction formatter isn't part of
  // the generic type), so let inference carry the real (correct) type through instead.
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = account ? createWalletClient({ chain: base, transport: http(rpcUrl), account }) : undefined;
  const address = MARKETPLACE_ADDRESSES.mechMarketplaceProxy;

  function requireAccount(): Account {
    if (!account) {
      throw new Error(
        'MarketplaceClient: createMech requires a signing account — construct via ' +
          'createMarketplaceClient(rpcUrl, account), not the no-account read-only default.',
      );
    }
    return account;
  }

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

    async simulateCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`) {
      const acct = requireAccount();
      const { result } = await client.simulateContract({
        address: factory,
        abi: MECH_FACTORY_ABI,
        functionName: 'createMech',
        args: [SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2, serviceId, payload],
        account: acct,
      });
      return result;
    },
    async executeCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`) {
      requireAccount();
      const { request, result } = await client.simulateContract({
        address: factory,
        abi: MECH_FACTORY_ABI,
        functionName: 'createMech',
        args: [SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2, serviceId, payload],
        account,
      });
      const txHash: Hash = await walletClient!.writeContract(request);
      await client.waitForTransactionReceipt({ hash: txHash });
      return result;
    },
  };
}
