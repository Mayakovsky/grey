// Thin viem wrapper around the Base Mech Marketplace contract — read-side (always available) plus
// the createMech write path (BION-DIRECTIVE-28), which needs a signing `account` and is therefore
// only reachable when the client is constructed with one. MechAdapter's own default construction
// (`createMarketplaceClient(rpcUrl)`, no account) stays read-only-safe; a real deployment wanting
// registerAsMech to work injects a client built with an account instead (same injection pattern
// serviceRegistryClient.ts already uses).
//
// FIXED (BION-DIRECTIVE-33): simulateCreateMech/executeCreateMech used to call
// `MechFactory.createMech(serviceRegistry, serviceId, payload)` directly — real, live testing
// against Base mainnet revealed this ALWAYS reverts `MarketplaceOnly(sender, marketplace)`
// (confirmed via the ABI-decoded revert, not a guess): the factory only accepts calls from the
// real Marketplace contract itself, never a wallet directly. Traced the real
// `MechMarketplace.sol` source: the actual entry point is `MechMarketplace.create(serviceId,
// mechFactory, payload)`, which requires the caller be the service's real owner or multisig
// (confirmed true for BASE_MECH_PAY_TO against Grey's own services) and the factory be
// whitelisted (confirmed live: NATIVE factory IS whitelisted) — then it calls the factory
// itself, satisfying `MarketplaceOnly` because the call now genuinely comes from the Marketplace.
// Same wrapper-contract pattern already established elsewhere in this codebase
// (ServiceManager.create() wraps ServiceRegistryL2.create() the same way) — this call was simply
// never updated to match it.
//
// FIXED again (2026-08-11, live registration): executeCreateMech used to return the `result`
// from the pre-submission `simulateContract` call as if it were the real deployed mech address.
// It isn't guaranteed to be — confirmed live: Grey's own real registration's simulated prediction
// and its real deployed address genuinely differed. `MechFactory.createMech` deploys the new mech
// via plain `CREATE` (not `CREATE2`), whose resulting address depends on the *factory's* real
// deployer nonce at the moment of actual execution — on a busy, shared factory contract, that
// nonce can shift between the simulate step and the real broadcast moments later, if anyone
// else's transaction lands on the same factory in between. The simulated prediction is not
// ground truth for a CREATE-based deployment; only the real receipt is. Fixed by decoding the
// real `CreateMech` event out of the real transaction receipt instead of trusting the simulation.
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Address,
  type Account,
  type Hash,
  type Log,
} from 'viem';
import { base } from 'viem/chains';
import { MARKETPLACE_ADDRESSES } from './config.js';
import { MECH_MARKETPLACE_ABI } from './marketplaceAbi.js';

/** Extracted so it's directly unit-testable against real, fixture'd log data (see
 *  test/marketplaceClient.test.ts) rather than only provable by re-running a live transaction.
 *  Tries every log in the receipt; only accepts one that actually decodes as `CreateMech` —
 *  a real tx can contain other logs (e.g. from the factory itself) that must be skipped, not
 *  mistaken for this one. */
export function decodeCreateMechAddress(logs: readonly Pick<Log, 'data' | 'topics'>[], txHash: string): Address {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: MECH_MARKETPLACE_ABI,
        eventName: 'CreateMech',
        data: log.data,
        topics: log.topics,
      });
      return decoded.args.mech;
    } catch {
      continue;
    }
  }
  throw new Error(
    `MarketplaceClient.executeCreateMech: real tx ${txHash} succeeded but no CreateMech event ` +
      'was found in its receipt — cannot determine the real deployed mech address. Do not ' +
      'trust any previously-logged/simulated address; verify manually against the real receipt.',
  );
}

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
        address,
        abi: MECH_MARKETPLACE_ABI,
        functionName: 'create',
        args: [serviceId, factory, payload],
        account: acct,
      });
      return result;
    },
    async executeCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`) {
      requireAccount();
      const { request } = await client.simulateContract({
        address,
        abi: MECH_MARKETPLACE_ABI,
        functionName: 'create',
        args: [serviceId, factory, payload],
        account,
      });
      const txHash: Hash = await walletClient!.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      // Ground truth is the real CreateMech event in the real receipt — NOT the simulated
      // `result` above (see this file's header for why that can diverge for a CREATE-based
      // deployment).
      return decodeCreateMechAddress(receipt.logs, txHash);
    },
  };
}
