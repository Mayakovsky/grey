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
// ── activateRegistration's real NOT_MINTED incident (BION-DIRECTIVE-32) ─────────────────────
// The first real live attempt: create() genuinely succeeded (real service 635, real Transfer
// event, real ownerOf/getService reads all correct), then the immediately-following
// activateRegistration reverted `NOT_MINTED`. The create() receipt's real logs also showed an
// unanticipated side effect — a second contract, `0x8004a169...` ("8004: Identity Registry" —
// ServiceManager.sol's real `identityRegistryBridger`, an ERC-8004-pattern bridge Grey's earlier
// research never surfaced as live on this deployment) minting a separate identity NFT and
// linking it to a different address. That was the leading suspect. **It was a red herring** —
// traced the real `ServiceManager.sol` source: `identityRegistryBridger` is only called from
// `create()` and the multisig-update path, never from `activateRegistration`'s own call chain
// (`ServiceManager.activateRegistration` → `ServiceRegistryTokenUtility
// .activateRegistrationTokenDeposit` → `ServiceRegistryL2.activateRegistration`). Confirmed live,
// not just from source: isolated and directly re-called every real sub-step in that actual chain
// against Base mainnet — `ownerOf(635)`, `activateRegistrationTokenDeposit(635)`, and
// `ServiceRegistryL2.activateRegistration` all succeeded cleanly in isolation, and the exact
// original top-level call (`ServiceManager.activateRegistration(635)` as the real
// `BASE_MECH_PAY_TO` account) also succeeded when re-run later, repeatedly, with no code change.
//
// Real conclusion: a transient RPC read-after-write consistency gap, not a missing protocol
// step, not an adapter bug, not an account-state gap. `executeCreate`'s
// `waitForTransactionReceipt` only guarantees create()'s tx is mined — it does NOT guarantee
// every backend behind a public, load-balanced RPC endpoint (`mainnet.base.org`) has caught up
// to that block yet before the very next call lands. Fixed with `waitForServiceVisible` below —
// a bounded poll of a real read (`getService`), not a retry on the mutating call itself — inserted
// between `executeCreate` and the subsequent real `activateRegistration`/`registerAgents` calls.
//
// ── existingServiceId resume was all-or-nothing — FIXED (BION-DIRECTIVE-33) ────────────────
// The second real live attempt (against real service 635, resumed via `existingServiceId`)
// found the prior resume logic wrong: it unconditionally skipped straight to `deploy()` whenever
// `existingServiceId` was set, regardless of the service's real state — correct only if
// activateRegistration/registerAgents had already happened for real, which for 635 they hadn't
// (D-32 proved those two calls work in isolation, not that the actual resume path reaches them).
// Now state-aware: one real `getService` read decides what's actually left
// (PreRegistration→needs all 4 remaining steps, ActiveRegistration→3, FinishedRegistration→2,
// Deployed→createMech only, reusing the real existing multisig; NonExistent/TerminatedBonded
// throw rather than attempt anything). Also added the real custom-error sets from
// `IErrorsRegistries.sol`/`IErrorsMarketplace.sol`/`IErrorsMech.sol` to the ABIs
// (serviceRegistryAbi.ts/marketplaceAbi.ts) so a revert prints a real decoded name+args instead
// of a bare selector — this is what let a THIRD real bug surface and get fixed in the same pass:
// `simulateCreateMech`/`executeCreateMech` were calling `MechFactory.createMech()` directly,
// which live-testing (now decodable) showed always reverts `MarketplaceOnly` — the factory only
// accepts calls from the real Marketplace contract. Fixed in marketplaceClient.ts to go through
// `MechMarketplace.create()` instead (see that file's header for the full trace).
//
// Structural limit, not a bug — worth understanding, not "fixable": simulating the *whole*
// remaining chain in one `observeOnly:true` pass only works when at most one step remains
// (e.g. Deployed→createMech). Any state with 2+ remaining steps hits the same
// simulateContract-calls-don't-chain wall D-31/D-32 already found — e.g. from PreRegistration,
// simulated `registerAgents` correctly reverts `WrongServiceState(1, serviceId)` because the
// preceding `activateRegistration` was only simulated, never actually executed, so real state
// never advanced. Confirmed live (BION-DIRECTIVE-33): every individually-reachable step's real
// preconditions check out correctly; only genuine, sequential real execution proves the full
// chain — no amount of additional simulation logic changes that.
//
// Safety: every write path in registerAsMech runs through config.observeOnly, same seam e3-b1
// already shipped (defaults true — this codebase's standing "no real tx without an explicit,
// reviewed override" posture). observeOnly=true simulates the full lifecycle (viem
// simulateContract — predicts results, submits nothing) and returns without ever calling
// walletClient.writeContract. Flipping it to false is a deployment-time decision, not something
// this class defaults to or can be talked into via any argument to registerAsMech itself.
import { setTimeout as delay } from 'node:timers/promises';
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
import { SERVICE_STATE } from './serviceRegistryAbi.js';
import type { ServiceRegistryClient } from './serviceRegistryClient.js';
import { createLogger, type AdapterLogger } from './logger.js';

export interface ServiceRegistrationParams {
  /** Caller-chosen canonical agent Id — no on-chain existence check on Base (see file header).
   *  Any small, unused uint32 is valid; does not need to reference a real L1-minted agent. */
  agentId: number;
  /** Bond per agent instance, wei. No protocol minimum beyond nonzero — see file header's real
   *  precedent note. This adapter does not choose a "real" funding figure; the caller must. */
  bondWei: bigint;
  /** IPFS hash (bytes32) of this service's config metadata. Real content now exists — pass
   *  `GREY_MECH_CONFIG_HASH` (config.ts, BION-DIRECTIVE-30) for Grey's actual service. Still a
   *  caller-supplied param, not defaulted here, so tests/other callers can pass their own. */
  configHash: `0x${string}`;
  /** Payload passed to MechFactory*.createMech. The wire format was genuinely undocumented as of
   *  e3-b3/D-26 (listing.ts's note); BION-DIRECTIVE-30 recovered it for real from a live registered
   *  mech's actual document — pass `GREY_MECH_PAYLOAD_HASH` (config.ts) for Grey's actual service. */
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

/** BION-DIRECTIVE-34 — result of `registerAsMechStep`, which runs exactly one real step. */
export interface SingleStepResult {
  serviceId: bigint;
  /** Which step actually ran. */
  step: 'create' | 'activateRegistration' | 'registerAgents' | 'deploy' | 'createMech';
  /** The service's real `ServiceState` (serviceRegistryAbi.ts's `SERVICE_STATE`) BEFORE this
   *  step ran — `NonExistent` (0) when `step === 'create'`, since nothing existed yet. */
  stateBefore: number;
  simulatedOnly: boolean;
  /** Set from `step === 'deploy'` onward — the real (or already-known, if reusing an existing
   *  Deployed service) multisig address. Undefined for 'create'/'activateRegistration'/
   *  'registerAgents', which don't produce or need one. */
  multisig?: Address;
  /** Set only when `step === 'createMech'`. */
  mech?: Address;
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
  /** `waitForServiceVisible`'s poll knobs (BION-DIRECTIVE-32) — overridable so tests can exercise
   *  the wait/timeout logic without real delays. Defaults match the real-world lag this was
   *  built to absorb; production callers should not normally need to override this. */
  serviceVisibilityPoll?: { maxAttempts: number; delayMs: number };
}

/** Reverse lookup of SERVICE_STATE, for log/error messages (BION-DIRECTIVE-33). */
const SERVICE_STATE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(SERVICE_STATE).map(([name, value]) => [value, name]),
);

const DEFAULT_SERVICE_VISIBILITY_POLL = { maxAttempts: 5, delayMs: 1500 };

export class MechAdapter implements ChannelIngress {
  private readonly config: MechAdapterConfig;
  private readonly client: MarketplaceClient;
  private readonly registryClient?: ServiceRegistryClient;
  private readonly log: AdapterLogger;
  private readonly offerings: OfferingRegistration[] = [];
  private readonly serviceVisibilityPoll: { maxAttempts: number; delayMs: number };
  private started = false;

  constructor(opts: MechAdapterOptions) {
    this.config = opts.config;
    this.client = opts.marketplaceClient ?? createMarketplaceClient(opts.config.rpcUrl);
    this.registryClient = opts.serviceRegistryClient;
    this.log = opts.logger ?? createLogger({ component: 'mech-adapter' });
    this.serviceVisibilityPoll = opts.serviceVisibilityPoll ?? DEFAULT_SERVICE_VISIBILITY_POLL;
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

  /** Runs whatever's actually still needed of the registration lifecycle (create →
   *  activateRegistration → registerAgents → deploy → MechFactory.createMech) — state-aware
   *  (BION-DIRECTIVE-33) since D-32's real live run found the previous all-or-nothing
   *  `existingServiceId` branch wrong: resuming a real service must run only the steps that
   *  haven't happened yet, determined from its real current `ServiceState`, not skip straight to
   *  `deploy()` regardless. Gated end-to-end by config.observeOnly (see file header) — every step
   *  is always simulated first (simulateContract); execution only happens when observeOnly is
   *  false. */
  async registerAsMech(paymentType: MechPaymentType, params: ServiceRegistrationParams): Promise<RegisterAsMechResult> {
    const registry = this.requireRegistryClient('registerAsMech');
    const simulatedOnly = this.config.observeOnly;

    let serviceId: bigint;
    if (params.existingServiceId !== undefined) {
      serviceId = params.existingServiceId;
      this.log.info('MechAdapter.registerAsMech: resuming existing service', {
        serviceId: serviceId.toString(),
      });
    } else {
      serviceId = await this.runCreateStep(registry, params, simulatedOnly, 'registerAsMech');
    }

    // BION-DIRECTIVE-33: state-aware resume. ONE real read decides what's actually left to do —
    // for a service resumed via existingServiceId AND for one just freshly created (which is
    // always PreRegistration at this point, so this same logic naturally runs the full remaining
    // chain for it too — no separate "fresh" branch needed).
    const service = await registry.getService(serviceId);
    this.log.info('MechAdapter.registerAsMech: current service state', {
      serviceId: serviceId.toString(),
      state: service.state,
      stateName: SERVICE_STATE_NAME[service.state] ?? 'unknown',
    });
    this.assertResumable(serviceId, service.state, 'registerAsMech');

    const needsActivateRegistration = service.state === SERVICE_STATE.PreRegistration;
    const needsRegisterAgents =
      service.state === SERVICE_STATE.PreRegistration || service.state === SERVICE_STATE.ActiveRegistration;
    const needsDeploy = service.state !== SERVICE_STATE.Deployed;

    if (needsActivateRegistration) {
      await this.runActivateRegistrationStep(registry, serviceId, params.bondWei, simulatedOnly);
    }
    if (needsRegisterAgents) {
      await this.runRegisterAgentsStep(registry, serviceId, params.agentId, params.bondWei, simulatedOnly);
    }

    let multisig: Address;
    if (needsDeploy) {
      multisig = await this.runDeployStep(registry, serviceId, simulatedOnly);
    } else {
      // Already Deployed — a real multisig exists already, no deploy() call needed or valid
      // (ServiceRegistryL2.deploy requires state === FinishedRegistration, see D-32's tracing).
      multisig = service.multisig;
      this.log.info('MechAdapter.registerAsMech: already deployed, reusing existing multisig', {
        serviceId: serviceId.toString(),
        multisig,
      });
    }

    const mech = await this.runCreateMechStep(paymentType, serviceId, params.mechPayload, simulatedOnly);

    this.log.info('MechAdapter.registerAsMech: complete', {
      serviceId: serviceId.toString(),
      multisig,
      mech,
      simulatedOnly,
    });

    return { serviceId, multisig, mech, simulatedOnly };
  }

  /** BION-DIRECTIVE-34 — runs exactly ONE real step of the registration lifecycle (whichever is
   *  next for the service's current real state) and returns without attempting anything further.
   *  `registerAsMech` (above) runs EVERYTHING still needed in one call — correct for a single
   *  simulate-only dry run, but wrong for a real live run: real money should move one step at a
   *  time, each one confirmed landed before the next is even attempted (see
   *  `register-live.ts`/its runbook). Reuses the exact same real step-runner helpers and
   *  state → next-step mapping `registerAsMech` uses — same steps, same order, same
   *  execute-vs-simulate gating, just stops after exactly one. */
  async registerAsMechStep(paymentType: MechPaymentType, params: ServiceRegistrationParams): Promise<SingleStepResult> {
    const registry = this.requireRegistryClient('registerAsMechStep');
    const simulatedOnly = this.config.observeOnly;

    if (params.existingServiceId === undefined) {
      const serviceId = await this.runCreateStep(registry, params, simulatedOnly, 'registerAsMechStep');
      return { serviceId, step: 'create', stateBefore: SERVICE_STATE.NonExistent, simulatedOnly };
    }

    const serviceId = params.existingServiceId;
    const service = await registry.getService(serviceId);
    const stateBefore = service.state;
    this.log.info('MechAdapter.registerAsMechStep: current service state', {
      serviceId: serviceId.toString(),
      state: stateBefore,
      stateName: SERVICE_STATE_NAME[stateBefore] ?? 'unknown',
    });
    this.assertResumable(serviceId, stateBefore, 'registerAsMechStep');

    if (stateBefore === SERVICE_STATE.PreRegistration) {
      await this.runActivateRegistrationStep(registry, serviceId, params.bondWei, simulatedOnly);
      return { serviceId, step: 'activateRegistration', stateBefore, simulatedOnly };
    }
    if (stateBefore === SERVICE_STATE.ActiveRegistration) {
      await this.runRegisterAgentsStep(registry, serviceId, params.agentId, params.bondWei, simulatedOnly);
      return { serviceId, step: 'registerAgents', stateBefore, simulatedOnly };
    }
    if (stateBefore === SERVICE_STATE.FinishedRegistration) {
      const multisig = await this.runDeployStep(registry, serviceId, simulatedOnly);
      return { serviceId, step: 'deploy', stateBefore, simulatedOnly, multisig };
    }
    // Only Deployed can reach here — assertResumable above already ruled out every other state.
    const mech = await this.runCreateMechStep(paymentType, serviceId, params.mechPayload, simulatedOnly);
    return { serviceId, step: 'createMech', stateBefore, simulatedOnly, multisig: service.multisig, mech };
  }

  private requireRegistryClient(caller: string): ServiceRegistryClient {
    if (!this.registryClient) {
      throw new Error(
        `MechAdapter.${caller}: no serviceRegistryClient configured — see MechAdapterOptions ` +
          'doc comment. This adapter never constructs a signing client itself (no private key ' +
          'loaded in this package).',
      );
    }
    return this.registryClient;
  }

  private static readonly RESUMABLE_STATES: readonly number[] = [
    SERVICE_STATE.PreRegistration,
    SERVICE_STATE.ActiveRegistration,
    SERVICE_STATE.FinishedRegistration,
    SERVICE_STATE.Deployed,
  ];

  private assertResumable(serviceId: bigint, state: number, caller: string): void {
    if (!MechAdapter.RESUMABLE_STATES.includes(state)) {
      throw new Error(
        `MechAdapter.${caller}: service ${serviceId} is in state ${state} ` +
          `(${SERVICE_STATE_NAME[state] ?? 'unknown'}), which this code path cannot resume ` +
          '— NonExistent means nothing to resume, TerminatedBonded means the service is past ' +
          'recovery via this flow. Not attempting anything; verify manually before proceeding.',
      );
    }
  }

  private async runCreateStep(
    registry: ServiceRegistryClient,
    params: ServiceRegistrationParams,
    simulatedOnly: boolean,
    caller: string,
  ): Promise<bigint> {
    const createArgs = {
      serviceOwner: this.config.payToAddress,
      token: ETH_TOKEN_ADDRESS,
      configHash: params.configHash,
      agentIds: [params.agentId],
      agentParams: [{ slots: 1, bond: params.bondWei }],
      threshold: 1,
    };
    if (simulatedOnly) {
      const sim = await registry.simulateCreate(createArgs);
      this.log.info(`MechAdapter.${caller}: create simulated (observeOnly)`, { serviceId: sim.serviceId.toString() });
      return sim.serviceId;
    }
    const res = await registry.executeCreate(createArgs);
    this.log.info(`MechAdapter.${caller}: create executed`, {
      serviceId: res.serviceId.toString(),
      txHash: res.txHash,
    });
    // BION-DIRECTIVE-32: wait for the just-created service to actually be READ-visible before
    // proceeding — see this file's header for the full incident. waitForTransactionReceipt
    // (inside executeCreate) only guarantees the tx is mined; it does NOT guarantee every
    // backend behind a public, load-balanced RPC endpoint has caught up to that block yet.
    // This polls a real READ (getService), not the mutating call itself — a bounded wait for
    // read-after-write consistency, not a blind retry-and-hope on the real transaction.
    await this.waitForServiceVisible(registry, res.serviceId);
    return res.serviceId;
  }

  private async runActivateRegistrationStep(
    registry: ServiceRegistryClient,
    serviceId: bigint,
    bondWei: bigint,
    simulatedOnly: boolean,
  ): Promise<void> {
    if (simulatedOnly) {
      await registry.simulateActivateRegistration(serviceId, bondWei);
    } else {
      await registry.executeActivateRegistration(serviceId, bondWei);
    }
  }

  private async runRegisterAgentsStep(
    registry: ServiceRegistryClient,
    serviceId: bigint,
    agentId: number,
    bondWei: bigint,
    simulatedOnly: boolean,
  ): Promise<void> {
    if (simulatedOnly) {
      await registry.simulateRegisterAgents(serviceId, [this.config.payToAddress], [agentId], bondWei);
    } else {
      await registry.executeRegisterAgents(serviceId, [this.config.payToAddress], [agentId], bondWei);
    }
  }

  private async runDeployStep(registry: ServiceRegistryClient, serviceId: bigint, simulatedOnly: boolean): Promise<Address> {
    const multisigImplementation = SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig;
    const deployData = '0x' as const;
    return simulatedOnly
      ? (await registry.simulateDeploy(serviceId, multisigImplementation, deployData)).multisig
      : (await registry.executeDeploy(serviceId, multisigImplementation, deployData)).multisig;
  }

  private async runCreateMechStep(
    paymentType: MechPaymentType,
    serviceId: bigint,
    mechPayload: `0x${string}`,
    simulatedOnly: boolean,
  ): Promise<Address> {
    const factory = MARKETPLACE_ADDRESSES.factories[paymentType];
    return simulatedOnly
      ? await this.simulateCreateMech(factory, serviceId, mechPayload)
      : await this.executeCreateMech(factory, serviceId, mechPayload);
  }

  /** BION-DIRECTIVE-32 — polls a real `getService` read (never the mutating call) until the
   *  just-created service is visible (`state !== NonExistent`), or throws after
   *  `serviceVisibilityPoll.maxAttempts`. This is deliberately NOT a retry on
   *  `executeActivateRegistration` itself — that would be "retry-and-hope" over a real,
   *  fund-moving call. Polling a read to confirm the RPC backend has actually caught up before
   *  making that call once is a bounded wait for a known, real eventual-consistency gap, not a
   *  blind retry. See file header for the full incident this fixes. */
  private async waitForServiceVisible(registry: ServiceRegistryClient, serviceId: bigint): Promise<void> {
    const { maxAttempts, delayMs } = this.serviceVisibilityPoll;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const service = await registry.getService(serviceId);
      if (service.state !== SERVICE_STATE.NonExistent) {
        return;
      }
      this.log.info('MechAdapter.registerAsMech: service not yet read-visible, waiting for RPC catch-up', {
        serviceId: serviceId.toString(),
        attempt,
      });
      if (attempt < maxAttempts) {
        await delay(delayMs);
      }
    }
    throw new Error(
      `MechAdapter.registerAsMech: service ${serviceId} still not visible via getService after ` +
        `${maxAttempts} attempts (~${(maxAttempts * delayMs) / 1000}s) — this is longer than the ` +
        'observed real-world lag (BION-DIRECTIVE-32), so treat this as a genuine problem, not more ' +
        'transient lag: do not blindly retry activateRegistration against it.',
    );
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
