// Fail-closed config load — mirrors acp-adapter/x402-middleware/grey-sweeper discipline (hand-
// rolled, no zod). Any missing required env → throw → the systemd unit exits non-zero rather
// than running half-configured.
//
// Contract addresses are Base-mainnet literals (source literal pattern, invariant #16), not
// env-configurable — verified 2026-08-08 against two independent primary sources (mech-client's
// mech_client/configs/mechs.json and autonolas-marketplace's docs/configuration.json) plus a
// direct eth_getCode RPC check confirming real deployed bytecode. See MARKETPLACE_ADDRESSES below
// for the full citation. RPC URL and the two wallet addresses ARE env-configurable (G4 — wallets
// are ceremony-generated, address only, never a key in this repo).
import process from 'node:process';
import type { Address } from 'viem';
import type { OfferingSlug } from '@grey/schemas/responses';

/** Grey's on-chain ERC-8004 DID — the unifying identity layer (Base mainnet, tokenId 58618). */
export const GREY_DID = 'did:erc8004:8453:58618';

/** Base mainnet Mech Marketplace deployment (chain id 8453). Source: autonolas-marketplace
 *  docs/configuration.json (raw-fetched, not summarized), cross-checked against mech-client's
 *  mech_client/configs/mechs.json (independent repo, same values) and a direct eth_getCode call
 *  against MECH_MARKETPLACE_PROXY on Base mainnet confirming real deployed bytecode (2026-08-08).
 *  MECH_MARKETPLACE_PROXY is the address callers use — MechMarketplace (no "Proxy" suffix) is the
 *  implementation contract behind it, kept here for reference only; never call it directly. */
export const MARKETPLACE_ADDRESSES = {
  chainId: 8453,
  mechMarketplaceProxy: '0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020' as Address,
  mechMarketplaceImplementation: '0x155547857680A6D51bebC5603397488988DEb1c8' as Address,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  /** MechFactory* addresses — one per payment type. All five confirmed deployed on Base
   *  (contrary to the directive's caution not to assume parity with Gnosis — Base actually has
   *  full parity, verified via the same configuration.json source). `createMech(serviceRegistry,
   *  serviceId, payload)` on any of these requires an existing Olas `serviceId` from the
   *  ServiceRegistry contract — a separate, unresolved prerequisite. See mechAdapter.ts's
   *  `registerAsMech` doc comment. */
  factories: {
    NATIVE: '0x2E008211f34b25A7d7c102403c6C2C3B665a1abe' as Address,
    USDC_TOKEN: '0x5B70A66fe68c4c86FFd724B58cc56049c70e9D3D' as Address,
    OLAS_TOKEN: '0x97371B1C0cDA1D04dFc43DFb50a04645b7Bc9BEe' as Address,
    NATIVE_NVM: '0x847bBE8b474e0820215f818858e23F5f5591855A' as Address,
    TOKEN_NVM_USDC: '0x7beD01f8482fF686F025628e7780ca6C1f0559fc' as Address,
  },
} as const;

export type MechPaymentType = keyof typeof MARKETPLACE_ADDRESSES.factories;

/** Base mainnet Olas ServiceRegistry deployment (BION-DIRECTIVE-28) — the prerequisite lifecycle
 *  a service must complete before MechFactory*.createMech() will accept its serviceId (see
 *  MARKETPLACE_ADDRESSES's factories doc comment). Source: two independently-generated files in
 *  valory-xyz/autonolas-registries (scripts/deployment/l2/globals_base_mainnet.json and
 *  docs/configuration.json, both raw-fetched, values agree), cross-checked via direct eth_getCode
 *  RPC calls confirming real deployed bytecode at each address (2026-08-08). serviceManagerProxy
 *  is the address callers use; serviceManagerImplementation is reference only, never called
 *  directly (same proxy pattern as MARKETPLACE_ADDRESSES). gnosisSafeMultisig is the multisig
 *  implementation address `deploy()` expects. Real Base Sepolia testnet addresses also exist for
 *  this contract set (serviceRegistry 0x31D3202d8744B16A120117A053459DDFAE93c855, serviceManager
 *  0x5BA58970c2Ae16Cf6218783018100aF2dCcFc915) — unlike the Marketplace contracts (e3-b1), which
 *  have none — not wired here since this directive's fork-test posture matches e3-b1's for
 *  consistency, but worth knowing for a future live testnet dry run. */
export const SERVICE_REGISTRY_ADDRESSES = {
  chainId: 8453,
  serviceRegistryL2: '0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE' as Address,
  serviceRegistryTokenUtility: '0x34C895f302D0b5cf52ec0Edd3945321EB0f83dd5' as Address,
  serviceManagerImplementation: '0x32B5A40B43C4eDb123c9cFa6ea97432380a38dDF' as Address,
  serviceManagerProxy: '0x1262136cac6a06A782DC94eb3a3dF0b4d09FF6A6' as Address,
  operatorWhitelist: '0x3d77596beb0f130a4415df3D2D8232B3d3D31e44' as Address,
  gnosisSafeMultisig: '0x22bE6fDcd3e29851B29b512F714C328A00A96B83' as Address,
} as const;

/** ServiceManager's native-ETH bonding sentinel (BION-DIRECTIVE-29 — fixes the `token = address(0)`
 *  bug D-28 shipped). `create()`'s `token` param does NOT accept the zero address — it explicitly
 *  reverts with `ZeroAddress()` (confirmed live against real Base mainnet, D-28 Task 3/D-29 Task 1:
 *  `ZeroAddress()`'s selector `0xd92e233d` matched the real revert exactly). Native ETH instead has
 *  its own dedicated constant on the contract, `ETH_TOKEN_ADDRESS`, which routes bonding through
 *  `msg.value` directly rather than the ERC20/`ServiceRegistryTokenUtility` path any other nonzero
 *  address would take. Source: valory-xyz/autonolas-registries's ServiceManager.sol (raw-fetched,
 *  2026-08-10) — cross-checked by calling `VERSION()` (returns "1.2.0", matching the source) and
 *  `ETH_TOKEN_ADDRESS()` directly against both `serviceManagerProxy` and `serviceManagerImplementation`
 *  on live Base mainnet; both return this exact value (2026-08-10), not assumed from source alone. */
export const ETH_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;

/** Real, authored Olas service-config metadata (BION-DIRECTIVE-30) — the document `configHash`
 *  references. Content lives at
 *  `adapters/mech-adapter/metadata/service-config.json` (committed, human-reviewable, NOT this
 *  hex string alone). Schema (`name`/`description`/`code_uri`/`image`/`attributes`, that field
 *  order, compact `JSON.stringify` — no extra whitespace) and the hash derivation (IPFS
 *  CIDv0 of the JSON bytes → CIDv1 → base16 → strip the fixed `f01701220` prefix → `0x`-prefix
 *  the remaining 32-byte digest) both reverse-engineered from valory-xyz/open-autonomy's own
 *  `autonomy/chain/metadata.py` (`serialize_metadata`/`publish_metadata`, raw-fetched 2026-08-10)
 *  — not guessed. Verified end-to-end, not just against the source: fetched a real, currently-
 *  registered mech's actual IPFS-hosted document (via `gateway.autonolas.tech`, real content,
 *  confirmed byte-identical against its own on-chain hash using `ipfs-only-hash`), then ran this
 *  exact same CID-derivation pipeline over those real bytes and got the EXACT real on-chain
 *  bytes32 value back (`0x157d3b10...` for Gnosis service/mech 1722) — the pipeline is proven
 *  correct against live chain state, not just plausible from reading source.
 *
 *  `code_uri` points at a real `ipfs-only-hash` of this repo's actual, merged
 *  `adapters/mech-adapter/src/mechAdapter.ts` (commit `69a0b62`) — a pragmatic stand-in for a
 *  real AEA/Olas package bundle, which Grey doesn't have (this isn't an AEA-framework-packaged
 *  agent). `image` is `"tbd"` — no NFT artwork exists for this service; matches the literal
 *  convention the real, official `valory/mech` service's own metadata uses for the same gap
 *  (confirmed directly in its fetched document), not a guess.
 *
 *  PINNED (BION-DIRECTIVE-38-ADDENDUM, within the last 5 days of 2026-08-11) — Forces set up a
 *  Filebase account (bucket `grey-olas`) and pinned this file: real CID
 *  `QmP5eDJqDC2HZYgTjTuU2q5fWxfSo1AZxMGw8bue9vhiHG`. Independently confirmed, not just trusted:
 *  fetched via a public `dweb.link` gateway (not Filebase's own), byte-for-byte identical to the
 *  committed `service-config.json`, and Desktop separately decoded the CID's embedded digest
 *  against this exact hash constant — genuinely on the public IPFS network, not Filebase-local. */
export const GREY_MECH_CONFIG_HASH = '0x0b0369d289b53796ca168627ad9661cca8f9574e92f39318c8e2bae301c2a743' as const;

/** Real, authored Mech tool-catalog metadata (BION-DIRECTIVE-30) — the `payload` argument
 *  `MechFactory.createMech(serviceRegistry, serviceId, payload)` expects. This schema was
 *  genuinely UNDOCUMENTED before this — e3-b3/D-26 found no public spec and stopped rather than
 *  fabricate one. Recovered for real this pass: queried the real Gnosis Marketplace subgraph
 *  (`api.subgraph.autonolas.tech/api/proxy/marketplace-gnosis`, GraphQL `metadata_collection`)
 *  for real registered mechs' on-chain `metadata` hash, then fetched the actual document behind
 *  one via `gateway.autonolas.tech` (public gateways ipfs.io/dweb.link/w3s.link/nftstorage.link
 *  all timed out or 403'd — this one worked) — confirmed byte-identical to the on-chain hash via
 *  `ipfs-only-hash`, and cross-checked against a second, independent real mech's document (same
 *  shape). Real schema: `name`/`description`/`inputFormat`/`outputFormat`/`image`/`tools`
 *  (array of tool-name strings)/`toolMetadata` (keyed by tool name → `name`/`description`/
 *  `input: {type, description}`/`output: {type, description, schema}` — `input.type` is always
 *  `"text"` in every real example found, even for tools with structurally complex real inputs;
 *  `output.schema` carries a real JSON Schema object).
 *
 *  Content lives at `adapters/mech-adapter/metadata/mech-payload.json` (committed,
 *  human-reviewable). `tools` are Grey's two real e3-b2 mech offerings
 *  (`prediction_market_research`, `resolution_evidence_compiler`); each `output.schema` is
 *  Grey's own real, already-shipped response JSON Schema
 *  (`packages/grey-schemas/src/responses/v1/*.schema.json`), not reinvented. Same hash-derivation
 *  pipeline as `GREY_MECH_CONFIG_HASH` above — see that constant's doc comment for the full
 *  derivation/verification method, which applies identically here.
 *
 *  PINNED (BION-DIRECTIVE-38-ADDENDUM, within the last 5 days of 2026-08-11) — same Filebase
 *  bucket (`grey-olas`) as `GREY_MECH_CONFIG_HASH`: real CID
 *  `QmfJC5fjgE4JduiDWeUvGrTndGaUdHbLyX8XoLHqbMue7w`. Independently confirmed the same way: fetched
 *  via a public `dweb.link` gateway, byte-for-byte identical to the committed
 *  `mech-payload.json`, CID digest cross-checked against this exact hash constant. */
export const GREY_MECH_PAYLOAD_HASH = '0xfbf56850bd8bf51ed39884aab4a7cf20737139ff53ca233579d6e7cc9f5eff66' as const;

/** Ceremony complete (2026-08-08, Forces-run per EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-
 *  FORCES.md) — address only, no key or passphrase ever passed through this codebase. Recorded
 *  here for reference/traceability (same posture as KITE_POOL_WALLET_ADDRESS in grey-sweeper's
 *  config.ts); `loadConfig()` above still resolves these from env at runtime and stays the
 *  actual, tested source of truth — these constants are not wired into it. Deployment sets
 *  BASE_MECH_PAY_TO / BASE_MECH_POOL_WALLET to the values below; not done by this directive
 *  (no deploy in scope), so leaving the env mechanism authoritative rather than hardcoding these
 *  into loadConfig and re-touching an already-gated test surface for a shape the directive didn't
 *  ask for. */
export const BASE_MECH_PAY_TO_ADDRESS = '0x36c4a16ED1DD12056150E36dFe2271733366BAC5' as const;
export const BASE_MECH_POOL_WALLET_ADDRESS = '0xB98A06D0D92A429dFeb95438BaE9e624A6401727' as const;

/** Ceremony complete (2026-08-10, Forces-run per
 *  EXPANSION-E3-B1-AGENT-INSTANCE-KEY-CEREMONY-RUNBOOK-FORCES.md) — address only, same posture
 *  as the two constants above. BION-DIRECTIVE-35: `registerAgents` requires the agent instance
 *  address to be DIFFERENT from the operator (`payToAddress`) — `ServiceRegistryL2.sol` reverts
 *  `WrongOperator` when they're equal (confirmed live, both directions: `BASE_MECH_PAY_TO` as the
 *  agent instance reverts; a different address simulates cleanly). This is not a one-time
 *  registration detail — once `deploy()` runs, this address becomes the sole signer
 *  (`threshold=1`) of the service's real Safe multisig, and needs to sign a real transaction for
 *  every mech response delivered thereafter (traced via `OlasMech.sol`'s `deliverToMarketplace`,
 *  gated `onlyOperator` where operator means "is the multisig"). Deliberately NOT a reuse of
 *  `GREY_DID_OWNER` — Forces weighed and rejected sharing blast radius between a routinely-signing
 *  operational key and Grey's core identity anchor. Automated-signing wiring for this key is a
 *  separate, later decision — not resolved here. */
export const BASE_MECH_AGENT_INSTANCE_ADDRESS = '0x4391C092cF342C6a8eeCe352712fC0C8df14450d' as const;

/** Real, live, confirmed E3-B1 registration result (BION-E3-B1-LIVE-REGISTRATION-COMPLETE-REPORT-
 *  KOV.md, 2026-08-11) — same source-literal posture as the addresses above (invariant #16):
 *  address only, independently re-confirmed against real Base mainnet state (real deployed
 *  bytecode at both; `MechMarketplace.checkMech(GREY_MECH_ADDRESS)` returns exactly
 *  `GREY_MECH_MULTISIG_ADDRESS`, cross-confirming both against each other). Service 635, state
 *  Deployed. Until BION-DIRECTIVE-45, these values existed ONLY in that status report and in fork
 *  test fixtures (test/taskIntake.anvil.test.ts, test/safeDeliveryClient.anvil.test.ts) — a real
 *  gap this directive found: a systemd-run main.ts calling `deliverSigned`/`pollAndRespond` for
 *  real has nowhere else to get either address from. `GREY_MECH_ADDRESS` is specifically the
 *  address recovered from the real `CreateMech` event AFTER the live-registration report's own
 *  post-launch bug fix (the script's original printout, `0x15A8303D...`, has zero deployed
 *  bytecode and is NOT this mech) — see that report for the full trace; do not substitute the
 *  printed value from an older source. */
export const GREY_MECH_ADDRESS = '0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8' as const;
export const GREY_MECH_MULTISIG_ADDRESS = '0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872' as const;

/** The exact `tools` array committed in `metadata/mech-payload.json` — the real, on-chain-
 *  referenced tool catalog `GREY_MECH_PAYLOAD_HASH` pins. This is deliberately NOT
 *  `MECH_OFFERING_SLUGS` (prices.ts), which also includes `daily_tech_brief` — an offering priced
 *  elsewhere but never published as a mech tool, so a real buyer can never address it through this
 *  channel. `pollAndRespond`'s `registeredTools` param (and the offerings a live main.ts actually
 *  registers) should use this list, not the broader prices.ts one, to stay consistent with what's
 *  really reachable on-chain. */
export const GREY_MECH_REGISTERED_TOOLS = [
  'prediction_market_research',
  'resolution_evidence_compiler',
] as const satisfies readonly OfferingSlug[];

export interface MechAdapterConfig {
  /** Tier A hot wallet — receives mech task payments. Ceremony-generated, address only. */
  payToAddress: Address;
  /** Tier B pool wallet — consolidation point before eventual Tier D sweep. Address only. */
  poolWalletAddress: Address;
  /** Base RPC endpoint. Defaults to Base's own public RPC (verified reachable without a
   *  Cloudflare challenge, unlike some third-party RPCs hit during research). */
  rpcUrl: string;
  /** grey_pipeline_rw runtime credential for the shared handlers' cache reads. */
  databaseUrl: string;
  /** FDQ-63-style safety gate, same seam as acp-adapter's observeOnly — suppresses every
   *  on-chain write path (create/request/deliverMarketplace) when true. Defaults true: this
   *  adapter has no confirmed mainnet registration yet (Olas ServiceRegistry prerequisite
   *  unresolved — see mechAdapter.ts), so shipping with writes enabled by default would be wrong. */
  observeOnly: boolean;
  /** BION-DIRECTIVE-35 — the address `registerAgents` registers as the service's sole agent
   *  instance. Optional here so config construction sites that never call `registerAgents` (most
   *  tests, `start()`-only usage) don't need to supply it; `registerAsMechStep`/`registerAsMech`
   *  throw a clear error if `registerAgents` actually needs to run and this is missing. MUST be
   *  different from `payToAddress` — see `BASE_MECH_AGENT_INSTANCE_ADDRESS`'s doc comment for why. */
  agentInstanceAddress?: Address;
  /** BION-DIRECTIVE-51 — the real deployed mech contract address, used only for `start()`'s own
   *  read-only registration sanity-check log line (`MechMarketplace.checkMech(mech)`, which
   *  requires an actual factory-created mech address, NOT the operator/payToAddress EOA — a real
   *  bug found live: `start()` used to pass `payToAddress` here, which always reverts
   *  `UnauthorizedAccount` since that address was never created via a factory). Optional: the
   *  mech doesn't exist yet before registration runs (`register-live.ts`, most tests never need
   *  this); a real running deployment has it as `GREY_MECH_ADDRESS` and should pass it. Absent →
   *  `start()` simply skips the diagnostic rather than guessing an address to check. */
  mechAddress?: Address;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    throw new Error(`mech-adapter: missing required env ${key}`);
  }
  return v.trim();
}

function isAddress(v: string): v is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function requiredAddress(env: Env, key: string): Address {
  const raw = required(env, key);
  if (!isAddress(raw)) {
    throw new Error(`mech-adapter: ${key} is not a valid 0x-address, got "${raw}"`);
  }
  return raw as Address;
}

export function loadConfig(env: Env = process.env): MechAdapterConfig {
  return {
    payToAddress: requiredAddress(env, 'BASE_MECH_PAY_TO'),
    poolWalletAddress: requiredAddress(env, 'BASE_MECH_POOL_WALLET'),
    rpcUrl: env.BASE_RPC_URL?.trim() || 'https://mainnet.base.org',
    databaseUrl: required(env, 'GREY_DATABASE_URL'),
    observeOnly: (env.MECH_ADAPTER_OBSERVE_ONLY?.trim() ?? 'true') !== 'false',
  };
}

/** BION-DIRECTIVE-45 — cadence (ms) main.ts's poll loop calls pollAndRespond on. Deliberately NOT
 *  a field on MechAdapterConfig: pollAndRespond is a pure fromBlock/toBlock range query with no
 *  internal cadence of its own (see mechAdapter.ts's file header — cadence is explicitly a
 *  deployment concern, not this class's job), so this lives alongside loadConfig as its own
 *  env-parsing function rather than growing the class-consumed config shape for a value the class
 *  itself never reads. Configurable via env, not hardcoded, matching every other adapter's config
 *  pattern in this codebase (acp-adapter's ACP_ADAPTER_POLL_INTERVAL_MS, grey-sweeper's
 *  GREY_SWEEPER_TICK_MS). Default 300_000ms (5 min) mirrors grey-sweeper's own tick — see
 *  main.ts's header for why that's a reasonable starting cadence for this adapter too. */
export function loadPollIntervalMs(env: Env = process.env): number {
  const raw = env.MECH_ADAPTER_POLL_INTERVAL_MS?.trim();
  const value = raw ? Number(raw) : 300_000;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`mech-adapter: MECH_ADAPTER_POLL_INTERVAL_MS must be a positive integer, got "${raw}"`);
  }
  return value;
}
