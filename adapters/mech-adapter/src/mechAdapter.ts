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
//
// ── Signed delivery capability — BUILT, not turned on (BION-DIRECTIVE-38) ───────────────────────
// Since deploy() ran for real, BASE_MECH_AGENT_INSTANCE is the sole signer (threshold=1) of the
// service's real Safe multisig. Every delivered mech response requires a call to
// `deliverToMarketplace`, gated `onlyOperator` — which reads the multisig live from the
// ServiceRegistry and requires msg.sender literally BE it, not the agent-instance EOA. This
// directive builds that capability (deliverSigned, below — a real Safe execTransaction wrapping
// deliverToMarketplace, signed via the isolated agentInstanceSigner.ts loader) and fork-proves it
// against real Base mainnet state (test/safeDeliveryClient.anvil.test.ts, GREY_MECH_ANVIL=1).
//
// ── Task intake — BUILT, still not turned on (BION-DIRECTIVE-43) ────────────────────────────────
// D-38 closed the delivery half; nothing detected a real request, decoded it, or routed it to a
// real answer. `pollAndRespond` (below) is that missing middle: polls real `MarketplaceRequest`
// events where Grey's mech is the real `priorityMech` (taskIntake.ts — traced from the real
// MechMarketplace.sol source, not assumed, why that's the right filter), decodes each request's
// real IPFS-hash-encoded content (requestContent.ts — traced from a real, already-delivered Base
// request, not guessed: `requestDatas[i]` is a bytes32 IPFS content hash, same CID-derivation
// convention as GREY_MECH_CONFIG_HASH/GREY_MECH_PAYLOAD_HASH, resolving to `{prompt, tool, nonce,
// schema_version, request_context}`), routes by the real `tool` field to the exact same shared
// `offeringHandlers[slug]` x402/ACP already call (never re-implemented here), and derives what the
// response's own IPFS hash would be. Still does not pin anything to a real IPFS/Filebase service —
// that publish step is deliberately deferred the same way GREY_MECH_CONFIG_HASH/PAYLOAD_HASH were
// (computed here, published later, separately) — see requestContent.ts's `deriveResponseHash` doc
// comment. Composes with `deliverSigned` above for the final signed submission. Like D-38, this is
// built and fork-proven only: no automatic trigger, no live mainnet call, `observeOnly` untouched.
import { setTimeout as delay } from 'node:timers/promises';
import type { ChannelIngress, ChannelIdentity, HandlerDeps, OfferingHandler, OfferingRegistration } from '@grey/core';
import type { Address, Hash, Hex, PublicClient } from 'viem';
import type { OfferingSlug } from '@grey/schemas/responses';
import {
  ETH_TOKEN_ADDRESS,
  GREY_DID,
  type MechAdapterConfig,
  type MechPaymentType,
} from './config.js';
import { createMarketplaceClient, type MarketplaceClient } from './marketplaceClient.js';
import { nextStepForState } from './registrationResume.js';
import type { SafeDeliveryClient, SignedSafeDelivery } from './safeDeliveryClient.js';
import { SERVICE_STATE } from './serviceRegistryAbi.js';
import type { ServiceRegistryClient } from './serviceRegistryClient.js';
import { createLogger, type AdapterLogger } from './logger.js';
import { pollForOwnRequests, routeRequest, UnknownToolError } from './taskIntake.js';
import type { ResponsePinner } from './responsePinner.js';

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
  /** BION-DIRECTIVE-38 — required for deliverSigned to be callable. Same posture as
   *  serviceRegistryClient: no default, this package never constructs a signing Account itself.
   *  See agentInstanceSigner.ts for the isolated key-loading pattern a real deployment uses. */
  safeDeliveryClient?: SafeDeliveryClient;
  /** BION-DIRECTIVE-43 — required for pollAndRespond to be callable. A minimal read-only surface
   *  (not the full injected MarketplaceClient) since polling logs is the only capability needed
   *  here; a real deployment passes its existing viem PublicClient. */
  publicClient?: Pick<PublicClient, 'getLogs'>;
  /** BION-DIRECTIVE-43 — the shared offering handlers (`offeringHandlers` from `@grey/core`;
   *  fakes in tests) — the exact same map x402/ACP already call, never re-implemented here. */
  handlers?: Record<OfferingSlug, OfferingHandler>;
  /** BION-DIRECTIVE-43 — deps the shared handlers need (DB repos, clock, logger, config) —
   *  `createHandlerDeps` from `@grey/core` in production, fakes in tests. */
  handlerDeps?: HandlerDeps;
  /** BION-DIRECTIVE-45 — required for pollAndRespond to be callable (same posture as handlers/
   *  handlerDeps: no default, this package never provisions a real Filebase credential itself).
   *  `createFilebasePinner` (responsePinner.ts) in production, `createStubResponsePinner` or a
   *  fake in tests. */
  responsePinner?: ResponsePinner;
  /** BION-DIRECTIVE-58 — independent-of-`gateway.autonolas.tech` gateway for fetching an incoming
   *  request's real content (`requestContent.ts`'s `fetchRequestContent`, called from
   *  `taskIntake.ts`'s `routeRequest`). Mirrors `responsePinner`'s own `gatewayBaseUrl` override
   *  (main.ts's `loadGatewayOverride`) — this is the same real gap on the intake side: D-57's
   *  self-test found `gateway.autonolas.tech` itself genuinely degraded (confirmed via three
   *  independent checks — Filebase's own pin-status, two other public gateways resolving fine,
   *  and a real 504/context-deadline-exceeded from this one specifically), and this fetch had no
   *  override path at all until now, unlike the response-pin-verify leg. Undefined → `taskIntake.ts`
   *  keeps `fetchRequestContent`'s own hardcoded default, same "an outage shouldn't require a code
   *  change, but only for whoever set the override" posture as the pin-verify leg. */
  requestContentGatewayUrl?: string;
  logger?: AdapterLogger;
  /** `waitForServiceVisible`'s poll knobs (BION-DIRECTIVE-32) — overridable so tests can exercise
   *  the wait/timeout logic without real delays. Defaults match the real-world lag this was
   *  built to absorb; production callers should not normally need to override this. */
  serviceVisibilityPoll?: { maxAttempts: number; delayMs: number };
}

/** BION-DIRECTIVE-38 — result of `deliverSigned`. */
export interface DeliverSignedResult extends SignedSafeDelivery {
  success: boolean;
  /** True when this ran through simulateContract only (config.observeOnly) — see
   *  RegisterAsMechResult's field of the same name for the identical posture. */
  simulatedOnly: boolean;
  /** Set only when simulatedOnly is false — the real submitted transaction's hash. */
  txHash?: Hash;
}

/** BION-DIRECTIVE-43 — one routed request's outcome, before delivery. */
export interface TaskIntakeResult {
  requestId: Hash;
  slug: OfferingSlug;
  payload: unknown;
  responseHash: Hex;
  /** BION-DIRECTIVE-45 — the base16 CIDv1 gateway-path form of `responseHash`, already confirmed
   *  independently resolvable before this result exists at all (see taskIntake.ts's `routeRequest`
   *  and responsePinner.ts's file header). */
  pinnedCid: string;
}

/** BION-DIRECTIVE-43 — result of `pollAndRespond`. `delivery` is undefined when nothing in the
 *  polled range routed successfully (nothing to deliver — not an error). Per-request routing
 *  failures (an unrecognized tool, a handler error) are isolated to `routingErrors` — one bad
 *  request does not block delivering everything else that routed cleanly, same "isolate failures"
 *  posture as this codebase's other multi-item scans (e.g. the git/test watcher's per-repo
 *  isolation). */
export interface PollAndRespondResult {
  routed: TaskIntakeResult[];
  routingErrors: Array<{ requestId: Hash; error: string }>;
  delivery?: DeliverSignedResult;
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
  private readonly deliveryClient?: SafeDeliveryClient;
  private readonly publicClient?: Pick<PublicClient, 'getLogs'>;
  private readonly handlers?: Record<OfferingSlug, OfferingHandler>;
  private readonly handlerDeps?: HandlerDeps;
  private readonly responsePinner?: ResponsePinner;
  private readonly requestContentGatewayUrl?: string;
  private readonly log: AdapterLogger;
  private readonly offerings: OfferingRegistration[] = [];
  private readonly serviceVisibilityPoll: { maxAttempts: number; delayMs: number };
  private started = false;

  constructor(opts: MechAdapterOptions) {
    this.config = opts.config;
    this.client = opts.marketplaceClient ?? createMarketplaceClient(opts.config.rpcUrl);
    this.registryClient = opts.serviceRegistryClient;
    this.deliveryClient = opts.safeDeliveryClient;
    this.publicClient = opts.publicClient;
    this.handlers = opts.handlers;
    this.handlerDeps = opts.handlerDeps;
    this.responsePinner = opts.responsePinner;
    this.requestContentGatewayUrl = opts.requestContentGatewayUrl;
    this.log = opts.logger ?? createLogger({ component: 'mech-adapter' });
    this.serviceVisibilityPoll = opts.serviceVisibilityPoll ?? DEFAULT_SERVICE_VISIBILITY_POLL;
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('MechAdapter: already started');
    const numMechs = await this.client.numMechs();
    // BION-DIRECTIVE-51: checkMech(address mech) requires an actual factory-created mech address
    // (real source: reverts UnauthorizedAccount when mapAgentMechFactories[mech] == address(0))
    // — it is NOT a generic "is this address registered" check, and payToAddress (the operator
    // EOA) was never created via a factory, so calling it with payToAddress always reverted. Only
    // call it when config.mechAddress is actually set (see that field's own doc comment).
    let mechMultisig: Address | undefined;
    if (this.config.mechAddress) {
      mechMultisig = await this.client.checkMech(this.config.mechAddress);
    }
    this.started = true;
    this.log.info('MechAdapter: started', {
      observeOnly: this.config.observeOnly,
      offerings: this.offerings.map((o) => o.slug),
      payToAddress: this.config.payToAddress,
      marketplaceMechCount: numMechs.toString(),
      ...(mechMultisig ? { mechMultisig } : {}),
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

    // BION-DIRECTIVE-111 — single source of truth for state→step, shared with register-live.ts
    // (which needs to know the step BEFORE this call, to resolve the real createMech payload in
    // time — see registrationResume.ts's own doc comment on why that ordering matters).
    const step = nextStepForState(stateBefore);
    if (step === 'activateRegistration') {
      await this.runActivateRegistrationStep(registry, serviceId, params.bondWei, simulatedOnly);
      return { serviceId, step, stateBefore, simulatedOnly };
    }
    if (step === 'registerAgents') {
      await this.runRegisterAgentsStep(registry, serviceId, params.agentId, params.bondWei, simulatedOnly);
      return { serviceId, step, stateBefore, simulatedOnly };
    }
    if (step === 'deploy') {
      const multisig = await this.runDeployStep(registry, serviceId, simulatedOnly);
      return { serviceId, step, stateBefore, simulatedOnly, multisig };
    }
    // Only Deployed can reach here — assertResumable above already ruled out every other state.
    const mech = await this.runCreateMechStep(paymentType, serviceId, params.mechPayload, simulatedOnly);
    return { serviceId, step, stateBefore, simulatedOnly, multisig: service.multisig, mech };
  }

  /** BION-DIRECTIVE-38 — builds a real, signed Safe execTransaction wrapping deliverToMarketplace
   *  and, if config.observeOnly is false, submits it. Building + signing is itself safe regardless
   *  of observeOnly (pure construction plus read-only RPC calls — nothing is submitted); only the
   *  final submission is gated, same seam every other write path in this class already uses. NOT
   *  wired to any automatic trigger — see this file's header ("Signed delivery capability") for
   *  why: callers invoke this directly, exactly like every other explicit step method here. */
  async deliverSigned(mech: Address, requestIds: readonly Hash[], datas: readonly Hex[]): Promise<DeliverSignedResult> {
    const client = this.requireDeliveryClient('deliverSigned');
    const simulatedOnly = this.config.observeOnly;
    const signed = await client.buildSignedDelivery(mech, requestIds, datas);

    if (simulatedOnly) {
      const sim = await client.simulateDelivery(signed);
      this.log.info('MechAdapter.deliverSigned: simulated (observeOnly)', {
        mech,
        nonce: signed.nonce.toString(),
        success: sim.success,
      });
      return { ...signed, simulatedOnly, success: sim.success };
    }

    const res = await client.executeDelivery(signed);
    this.log.info('MechAdapter.deliverSigned: executed', {
      mech,
      nonce: signed.nonce.toString(),
      txHash: res.txHash,
      success: res.success,
    });
    return { ...signed, simulatedOnly, success: res.success, txHash: res.txHash };
  }

  /** BION-DIRECTIVE-43 — polls real `MarketplaceRequest` logs where `mech` is the real
   *  `priorityMech` (taskIntake.ts's `pollForOwnRequests` — see this file's header for why that's
   *  the right, real-contract-traced filter), routes each to the matching shared offering handler
   *  (`offeringHandlers[tool]`), and — if anything routed successfully — delivers all of them in
   *  ONE signed `deliverSigned` call. `fromBlock`/`toBlock` are the caller's cursor to manage
   *  (this method is a pure range query + respond, it doesn't persist a watermark) — cadence/
   *  production polling infra is a deployment decision, not this method's job. */
  async pollAndRespond(
    mech: Address,
    marketplaceAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
    registeredTools: readonly OfferingSlug[],
  ): Promise<PollAndRespondResult> {
    const publicClient = this.requirePublicClient('pollAndRespond');
    const handlers = this.requireHandlers('pollAndRespond');
    const handlerDeps = this.requireHandlerDeps('pollAndRespond');
    const responsePinner = this.requireResponsePinner('pollAndRespond');

    const detected = await pollForOwnRequests(publicClient, marketplaceAddress, mech, fromBlock, toBlock);
    this.log.info('MechAdapter.pollAndRespond: requests detected', { count: detected.length });

    const routed: TaskIntakeResult[] = [];
    const routingErrors: Array<{ requestId: Hash; error: string }> = [];
    for (const request of detected) {
      try {
        const fetchOpts = this.requestContentGatewayUrl ? { gatewayBaseUrl: this.requestContentGatewayUrl } : undefined;
        const result = await routeRequest(request, { registeredTools, handlers, handlerDeps, responsePinner }, fetchOpts);
        routed.push({
          requestId: request.requestId,
          slug: result.slug,
          payload: result.payload,
          responseHash: result.responseHash,
          pinnedCid: result.pinnedCid,
        });
        this.log.info('MechAdapter.pollAndRespond: request routed and pinned', {
          requestId: request.requestId,
          slug: result.slug,
          pinnedCid: result.pinnedCid,
          vendorCid: result.vendorCid,
        });
      } catch (err) {
        // BION-DIRECTIVE-45: this now also covers ResponsePinVerificationError and any Filebase
        // call failure (see taskIntake.ts's routeRequest) — same per-request isolation as an
        // UnknownToolError or a handler error, deliberately: one request's pin failing does not
        // block delivering everything else that routed and pinned cleanly this tick.
        const message = err instanceof UnknownToolError ? err.message : err instanceof Error ? err.message : String(err);
        this.log.warn('MechAdapter.pollAndRespond: request routing failed, skipping', {
          requestId: request.requestId,
          error: message,
        });
        routingErrors.push({ requestId: request.requestId, error: message });
      }
    }

    if (routed.length === 0) {
      return { routed, routingErrors };
    }

    const delivery = await this.deliverSigned(
      mech,
      routed.map((r) => r.requestId),
      routed.map((r) => r.responseHash),
    );
    return { routed, routingErrors, delivery };
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

  private requireDeliveryClient(caller: string): SafeDeliveryClient {
    if (!this.deliveryClient) {
      throw new Error(
        `MechAdapter.${caller}: no safeDeliveryClient configured — see MechAdapterOptions doc ` +
          'comment. This adapter never constructs a signing client itself (no private key loaded ' +
          'in this package) — see agentInstanceSigner.ts.',
      );
    }
    return this.deliveryClient;
  }

  private requirePublicClient(caller: string): Pick<PublicClient, 'getLogs'> {
    if (!this.publicClient) {
      throw new Error(`MechAdapter.${caller}: no publicClient configured — see MechAdapterOptions doc comment.`);
    }
    return this.publicClient;
  }

  private requireHandlers(caller: string): Record<OfferingSlug, OfferingHandler> {
    if (!this.handlers) {
      throw new Error(`MechAdapter.${caller}: no handlers configured — see MechAdapterOptions doc comment.`);
    }
    return this.handlers;
  }

  private requireHandlerDeps(caller: string): HandlerDeps {
    if (!this.handlerDeps) {
      throw new Error(`MechAdapter.${caller}: no handlerDeps configured — see MechAdapterOptions doc comment.`);
    }
    return this.handlerDeps;
  }

  private requireResponsePinner(caller: string): ResponsePinner {
    if (!this.responsePinner) {
      throw new Error(
        `MechAdapter.${caller}: no responsePinner configured — see MechAdapterOptions doc comment. ` +
          'This adapter never provisions a real Filebase credential itself — see filebaseCredentials.ts.',
      );
    }
    return this.responsePinner;
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

  /** BION-DIRECTIVE-35 — the agent instance MUST be a different address from the operator
   *  (`this.config.payToAddress`, implicit via `msg.sender`); `ServiceRegistryL2.sol` reverts
   *  `WrongOperator` when they're equal (confirmed live, both directions — see
   *  `BASE_MECH_AGENT_INSTANCE_ADDRESS`'s doc comment in config.ts). Requires
   *  `config.agentInstanceAddress` to be set — throws a clear, named error rather than silently
   *  falling back to `payToAddress`, which is exactly the wrong value here. */
  private async runRegisterAgentsStep(
    registry: ServiceRegistryClient,
    serviceId: bigint,
    agentId: number,
    bondWei: bigint,
    simulatedOnly: boolean,
  ): Promise<void> {
    const agentInstance = this.config.agentInstanceAddress;
    if (!agentInstance) {
      throw new Error(
        'MechAdapter: registerAgents requires config.agentInstanceAddress (BION-DIRECTIVE-35) — ' +
          'must be a real address different from payToAddress (ServiceRegistryL2 reverts ' +
          'WrongOperator otherwise). See config.ts\'s BASE_MECH_AGENT_INSTANCE_ADDRESS.',
      );
    }
    if (simulatedOnly) {
      await registry.simulateRegisterAgents(serviceId, [agentInstance], [agentId], bondWei);
    } else {
      await registry.executeRegisterAgents(serviceId, [agentInstance], [agentId], bondWei);
    }
  }

  private async runDeployStep(registry: ServiceRegistryClient, serviceId: bigint, simulatedOnly: boolean): Promise<Address> {
    // BION-DIRECTIVE-104 fix — was the bare Base constant, chain-blind; `registry` already knows
    // its own chain (via the `chainId` passed to createServiceRegistryClient, D-97/98).
    const multisigImplementation = registry.gnosisSafeMultisig;
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
    // BION-DIRECTIVE-104 fix — was the bare Base constant, chain-blind; `this.client` already
    // knows its own chain (via the `chainId` passed to createMarketplaceClient, D-97/98), and
    // fails closed if this chain has no factory for the requested payment type.
    const factory = this.client.getFactoryAddress(paymentType);
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
