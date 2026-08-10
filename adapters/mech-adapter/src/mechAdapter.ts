// MechAdapter — the Olas Mech Marketplace (Base) as a ChannelIngress (e3-b1). Grey's first
// on-chain-contract-settlement channel — no HTTP payment header (x402), no platform SDK, direct
// contract calls against MechMarketplaceProxy via viem. Modeled on acp-adapter's shape (config
// injection, OfferingRegistration catalog, observeOnly safety seam) but the lifecycle is
// necessarily thinner: this channel has no live request/response loop wired yet (see below).
//
// ── Registration gap — CLOSED (BION-DIRECTIVE-28) ───────────────────────────────────────────
// Becoming a mech on the Marketplace is NOT a single contract call. `MechFactory*.createMech()`
// requires a pre-existing Olas `serviceId` from a SEPARATE ServiceRegistry contract. e3-b1 shipped
// `registerAsMech` as a throwing stub naming this gap; BION-DIRECTIVE-28 closes it for real,
// confirmed against the real ServiceManager/ServiceRegistryL2 ABIs (fetched raw from
// valory-xyz/autonolas-registries, see serviceRegistryAbi.ts/serviceRegistryClient.ts):
//
// The lifecycle is 4 steps, not 5 — there is NO separate "mint an agent" step on Base.
// ServiceRegistryL2.sol's own doc comment: "Underlying canonical agents and components are not
// checked for their validity since they are set up on the L1 mainnet. The architecture is
// optimistic, in the sense that service owners are assumed to reference existing and relevant
// agents." `agentId` is a caller-chosen uint32 with no on-chain existence check on Base — the only
// checks are non-empty/sorted/unique. Real steps: create → activateRegistration → registerAgents
// → deploy (all on ServiceManagerProxy), then MechFactory*.createMech(serviceRegistry, serviceId,
// payload) from e3-b1's existing marketplaceClient/marketplaceAbi.
//
// Real bond precedent (4 live Base services read directly via getService, 2026-08-08): most use
// 1 wei securityDeposit — the protocol requires nonzero, nothing more. CORRECTED (BION-DIRECTIVE-
// 29): this is very likely a token-bonded-service observation, not a native-ETH one — `create()`
// wraps ERC20 bonding through ServiceRegistryTokenUtility with a documented `BOND_WRAPPER = 1 wei`
// placeholder passed to the base registry, which plausibly explains the "1 wei" pattern regardless
// of the service's real bond size. Not reconciled against which of the 4 sampled services were
// actually token- vs ETH-bonded — a real ETH-bond precedent is still unconfirmed. Grey's actual
// bond amount for a real registration is a Task 3 funding decision, not chosen by this adapter.
//
// `token` is `ETH_TOKEN_ADDRESS` (config.ts), NOT address(0) (BION-DIRECTIVE-29) — the real
// deployed contract reverts `ZeroAddress()` on a zero token; native ETH has its own dedicated
// sentinel constant instead, confirmed live against both serviceManagerProxy and
// serviceManagerImplementation on Base mainnet. See config.ts's ETH_TOKEN_ADDRESS doc comment.
//
// Safety: every write path in registerAsMech runs through config.observeOnly, same seam e3-b1
// already shipped (defaults true — this codebase's standing "no real tx without an explicit,
// reviewed override" posture). observeOnly=true simulates the full lifecycle (viem
// simulateContract — predicts results, submits nothing) and returns without ever calling
// walletClient.writeContract. Flipping it to false is a deployment-time decision, not something
// this class defaults to or can be talked into via any argument to registerAsMech itself.
import type { ChannelIngress, ChannelIdentity, OfferingRegistration } from '@grey/core';
import type { Address } from 'viem';
import {
  ETH_TOKEN_ADDRESS,
  GREY_DID,
  MARKETPLACE_ADDRESSES,
  SERVICE_REGISTRY_ADDRESSES,
  type MechAdapterConfig,
  type MechPaymentType,
} from './config.js';
import { createMarketplaceClient, type MarketplaceClient } from './marketplaceClient.js';
import type { ServiceRegistryClient } from './serviceRegistryClient.js';
import { createLogger, type AdapterLogger } from './logger.js';

export interface ServiceRegistrationParams {
  /** Caller-chosen canonical agent Id — no on-chain existence check on Base (see file header).
   *  Any small, unused uint32 is valid; does not need to reference a real L1-minted agent. */
  agentId: number;
  /** Bond per agent instance, wei. No protocol minimum beyond nonzero — see file header's real
   *  precedent note. This adapter does not choose a "real" funding figure; the caller must. */
  bondWei: bigint;
  /** IPFS hash (bytes32) of this service's config metadata. Content-authoring is out of scope
   *  here — pass whatever the caller has; a placeholder is acceptable for a simulate-only run. */
  configHash: `0x${string}`;
  /** Payload passed to MechFactory*.createMech (also IPFS-hash-shaped, off-chain-metadata scope
   *  — see listing.ts's own note on the undocumented mech metadata wire format). */
  mechPayload: `0x${string}`;
  /** Only meaningful if a service already exists for this operator (skips create/activate/
   *  register and goes straight to createMech against the existing serviceId). Omit to run the
   *  full 4-step lifecycle from scratch. */
  existingServiceId?: bigint;
}

export interface RegisterAsMechResult {
  serviceId: bigint;
  multisig: Address;
  mech: Address;
  /** True when this ran through simulateContract only (config.observeOnly) — nothing was
   *  submitted to any network, real or forked. False means every step executed for real against
   *  whatever network the injected clients point at (production code MUST only point this at a
   *  fork/testnet until Forces explicitly authorizes a real mainnet run — this class does not
   *  enforce that network choice itself, the same way e3-b1's clients don't). */
  simulatedOnly: boolean;
}

export interface MechAdapterOptions {
  config: MechAdapterConfig;
  /** Injected so tests can supply a fake; main.ts builds the real viem-backed client. */
  marketplaceClient?: MarketplaceClient;
  /** Required for registerAsMech to be callable at all — no default fallback, since building a
   *  real signing client needs an Account this package deliberately never constructs itself (no
   *  private key ever loaded here, same posture as every other adapter in this repo). Tests
   *  inject a fake; a real deployment injects a client built elsewhere from a ceremony-generated
   *  signer, out of this package's scope (see grey-sweeper/src/wallet.ts for the established
   *  pattern this repo already uses for that). */
  serviceRegistryClient?: ServiceRegistryClient;
  logger?: AdapterLogger;
}

export class MechAdapter implements ChannelIngress {
  private readonly config: MechAdapterConfig;
  private readonly client: MarketplaceClient;
  private readonly registryClient?: ServiceRegistryClient;
  private readonly log: AdapterLogger;
  private readonly offerings: OfferingRegistration[] = [];
  private started = false;

  constructor(opts: MechAdapterOptions) {
    this.config = opts.config;
    this.client = opts.marketplaceClient ?? createMarketplaceClient(opts.config.rpcUrl);
    this.registryClient = opts.serviceRegistryClient;
    this.log = opts.logger ?? createLogger({ component: 'mech-adapter' });
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('MechAdapter: already started');
    const numMechs = await this.client.numMechs();
    const selfRegistered = await this.client.checkMech(this.config.payToAddress);
    this.started = true;
    this.log.info('MechAdapter: started (read-only until registration lands)', {
      observeOnly: this.config.observeOnly,
      offerings: this.offerings.map((o) => o.slug),
      payToAddress: this.config.payToAddress,
      marketplaceMechCount: numMechs.toString(),
      selfRegisteredAsMech: selfRegistered,
    });
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  registerOffering(reg: OfferingRegistration): void {
    this.offerings.push(reg);
    this.log.info('MechAdapter: offering registered', { slug: reg.slug, priceUsd: reg.priceUsd });
  }

  identity(): ChannelIdentity {
    return { receivingAddress: this.config.payToAddress, did: GREY_DID };
  }

  listOfferings(): readonly OfferingRegistration[] {
    return this.offerings;
  }

  /** Runs the full registration lifecycle (create → activateRegistration → registerAgents →
   *  deploy → MechFactory.createMech), or just the createMech leg if `params.existingServiceId`
   *  is set. Gated end-to-end by config.observeOnly (see file header) — every step is always
   *  simulated first (simulateContract); execution only happens when observeOnly is false. */
  async registerAsMech(paymentType: MechPaymentType, params: ServiceRegistrationParams): Promise<RegisterAsMechResult> {
    if (!this.registryClient) {
      throw new Error(
        'MechAdapter.registerAsMech: no serviceRegistryClient configured — see MechAdapterOptions ' +
          'doc comment. This adapter never constructs a signing client itself (no private key ' +
          'loaded in this package).',
      );
    }
    const registry = this.registryClient;
    const simulatedOnly = this.config.observeOnly;
    const agentParams = [{ slots: 1, bond: params.bondWei }];
    const threshold = 1;

    let serviceId: bigint;
    if (params.existingServiceId !== undefined) {
      serviceId = params.existingServiceId;
      const service = await registry.getService(serviceId);
      this.log.info('MechAdapter.registerAsMech: using existing service', {
        serviceId: serviceId.toString(),
        state: service.state,
      });
    } else {
      const createArgs = {
        serviceOwner: this.config.payToAddress,
        token: ETH_TOKEN_ADDRESS,
        configHash: params.configHash,
        agentIds: [params.agentId],
        agentParams,
        threshold,
      };
      if (simulatedOnly) {
        const sim = await registry.simulateCreate(createArgs);
        serviceId = sim.serviceId;
        this.log.info('MechAdapter.registerAsMech: create simulated (observeOnly)', {
          serviceId: serviceId.toString(),
        });
      } else {
        const res = await registry.executeCreate(createArgs);
        serviceId = res.serviceId;
        this.log.info('MechAdapter.registerAsMech: create executed', {
          serviceId: serviceId.toString(),
          txHash: res.txHash,
        });
      }

      if (simulatedOnly) {
        await registry.simulateActivateRegistration(serviceId, params.bondWei);
        await registry.simulateRegisterAgents(serviceId, [this.config.payToAddress], [params.agentId], params.bondWei);
      } else {
        await registry.executeActivateRegistration(serviceId, params.bondWei);
        await registry.executeRegisterAgents(serviceId, [this.config.payToAddress], [params.agentId], params.bondWei);
      }
    }

    const multisigImplementation = SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig;
    const deployData = '0x' as const;
    const multisig = simulatedOnly
      ? (await registry.simulateDeploy(serviceId, multisigImplementation, deployData)).multisig
      : (await registry.executeDeploy(serviceId, multisigImplementation, deployData)).multisig;

    const factory = MARKETPLACE_ADDRESSES.factories[paymentType];
    const mech = simulatedOnly
      ? await this.simulateCreateMech(factory, serviceId, params.mechPayload)
      : await this.executeCreateMech(factory, serviceId, params.mechPayload);

    this.log.info('MechAdapter.registerAsMech: complete', {
      serviceId: serviceId.toString(),
      multisig,
      mech,
      simulatedOnly,
    });

    return { serviceId, multisig, mech, simulatedOnly };
  }

  /** MechFactory.createMech has no public read-only preview in the ABI this adapter carries
   *  (marketplaceAbi.ts's MECH_FACTORY_ABI is write-only, e3-b1 never needed a simulate path for
   *  it since it was unreachable). Both paths below go through the injected marketplace client's
   *  createMech, which the fake/test client is responsible for making side-effect-free when
   *  simulating — same contract as every other simulate* method on this class. */
  private async simulateCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`): Promise<Address> {
    return this.client.simulateCreateMech(factory, serviceId, payload);
  }

  private async executeCreateMech(factory: Address, serviceId: bigint, payload: `0x${string}`): Promise<Address> {
    return this.client.executeCreateMech(factory, serviceId, payload);
  }
}
