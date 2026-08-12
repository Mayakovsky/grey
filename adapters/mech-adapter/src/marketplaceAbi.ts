// Minimal MechMarketplace ABI subset — hand-picked from the REAL deployed ABI (fetched raw from
// autonolas-marketplace's abis/0.8.30/MechMarketplace.json, 2026-08-08; NOT reconstructed from
// docs or guessed — every signature below is copied verbatim from that fetch). Only the surface
// this adapter actually calls/reads; the full ABI is much larger (owner-only admin functions,
// signature-based delivery, etc.) and deliberately excluded.
//
// parseAbi() (not a bare string array) so viem infers real return types (bigint/Address/number)
// on readContract calls instead of falling back to `unknown` — vitest's esbuild transpile-only
// run doesn't catch that class of error, only `tsc --noEmit` does, so this matters for real.
import { parseAbi } from 'viem';

/** Real custom errors (BION-DIRECTIVE-33 Task 3) — copied verbatim from the real source, not
 *  guessed: `IErrorsMarketplace.sol` and `IErrorsMech.sol` (valory-xyz/autonolas-marketplace),
 *  the full declared sets, not just what this project happened to hit so far. Resolves a D-30
 *  loose end as a side effect: `0xe56895c0` (an undecoded createMech revert seen while proving
 *  D-30's real content) is `MarketplaceOnly(address,address)` — the Mech contract rejecting a
 *  caller that isn't the real Marketplace, not a mystery. */
const MARKETPLACE_ERRORS = [
  'error OwnerOnly(address sender, address owner)',
  'error ZeroAddress()',
  'error ZeroValue()',
  'error AlreadyInitialized()',
  'error WrongArrayLength(uint256 numValues1, uint256 numValues2)',
  'error InsufficientBalance(uint256 current, uint256 required)',
  'error NoDepositAllowed(uint256 amount)',
  'error Overflow(uint256 provided, uint256 max)',
  'error ReentrancyGuard()',
  'error UnauthorizedAccount(address account)',
  'error WrongServiceState(uint256 state, uint256 serviceId)',
  'error OutOfBounds(uint256 provided, uint256 min, uint256 max)',
  'error AlreadyRequested(bytes32 requestId)',
  'error WrongPaymentType(bytes32 paymentType)',
  'error TransferFailed(address token, address from, address to, uint256 amount)',
  'error IncorrectSignatureLength(bytes signature, uint256 provided, uint256 expected)',
  'error SignatureNotValidated(address requester, bytes32 msgHash, bytes signature)',
  'error MarketplaceOnly(address sender, address marketplace)',
] as const;

export const MECH_MARKETPLACE_ABI = parseAbi([
  'function numMechs() view returns (uint256)',
  'function checkMech(address mech) view returns (address)',
  'function getRequestStatus(bytes32 requestId) view returns (uint8)',
  'function getRequestId(address mech, address requester, bytes data, uint256 deliveryRate, bytes32 paymentType, uint256 nonce) view returns (bytes32)',
  'function mapRequestIdInfos(bytes32) view returns (address,address,address,uint256,uint256,bytes32)',
  'function mapMechDeliveryCounts(address) view returns (uint256)',
  'function deliverMarketplace(bytes32[] requestIds, uint256[] deliveryRates) returns (bool[])',
  'function mapMechFactories(address) view returns (bool)',
  /** BION-DIRECTIVE-33 — the real entry point for registering a service as a mech. NOT
   *  `MechFactory.createMech()` directly (see marketplaceClient.ts's file header for why that
   *  always reverts `MarketplaceOnly`) — this wraps that same call, requiring the caller be the
   *  real service owner or multisig (confirmed true for BASE_MECH_PAY_TO) and `mechFactory` be
   *  whitelisted (confirmed live: `mapMechFactories[NATIVE factory]` is `true`), then calls the
   *  factory itself so the factory's own `MarketplaceOnly` check passes for real. Verbatim from
   *  the real source, `valory-xyz/autonolas-marketplace`'s `MechMarketplace.sol`. */
  'function create(uint256 serviceId, address mechFactory, bytes memory payload) returns (address mech)',
  /** All three params are `indexed` — confirmed against a real emitted log (2026-08-11, Grey's
   *  own real registration, tx `0xf6fedb21...289a9e`): the raw log had exactly 3 topics beyond
   *  the event-signature topic0 and empty `data`, which only happens when every param is
   *  indexed. The event-signature hash itself (`keccak256("CreateMech(address,uint256,address)")`)
   *  matched the real observed topic0 exactly, confirming the name/types were always right — only
   *  the indexed-ness was wrong before. That mismatch is what let D-33's original (non-indexed)
   *  declaration silently fail to decode this event at all. */
  'event CreateMech(address indexed mech, uint256 indexed serviceId, address indexed mechFactory)',
  /** Both address params are `indexed` — confirmed against a real emitted log (2026-08-11, a
   *  real Base-mainnet request unrelated to Grey, tx `0x201fd7f3...9508e`): the raw log had
   *  exactly 3 topics (2 beyond topic0) and the remaining ABI-encoded fields fit the `data` blob
   *  exactly once decoded with both addresses excluded, which only happens when both are indexed
   *  — the original (non-indexed) declaration failed to decode this event at all (`decodeEventLog`
   *  threw "Data size ... too small"), the same class of bug D-36 found and fixed for `CreateMech`.
   *  BION-DIRECTIVE-43. */
  'event MarketplaceRequest(address indexed priorityMech, address indexed requester, uint256 numRequests, bytes32[] requestIds, bytes[] requestDatas)',
  'event MarketplaceDelivery(address deliveryMech, address[] requesters, uint256 numDeliveries, bytes32[] requestIds, bool[] deliveredRequests)',
  ...MARKETPLACE_ERRORS,
]);

// MechFactoryFixedPriceNative — also verified raw (abis/0.8.28/MechFactoryFixedPriceNative.json).
// Kept for reference/documentation only — NOT called directly by this adapter (BION-DIRECTIVE-33;
// see MECH_MARKETPLACE_ABI's `create` doc comment and marketplaceClient.ts's file header). Real
// callers go through MechMarketplace.create(), which invokes this internally.
export const MECH_FACTORY_ABI = parseAbi([
  'function createMech(address serviceRegistry, uint256 serviceId, bytes payload) returns (address)',
  'event CreateMechFixedPriceNative(address mech, uint256 serviceId, uint256 maxDeliveryRate)',
  ...MARKETPLACE_ERRORS,
]);

/** Request lifecycle status, per getRequestStatus's uint8 return. CORRECTED (BION-DIRECTIVE-43) —
 *  the prior values here were an inference flagged as unverified in the e3-b1 report, and turned
 *  out to be wrong: traced to the real `enum RequestStatus` declaration in
 *  valory-xyz/ai-registry-mech's MechMarketplace.sol (raw-fetched, cross-checked against the real
 *  deployed contract's own `VERSION()` returning "1.1.0", matching the fetched source exactly —
 *  not assumed). The real enum has 4 members, not 3 — `RequestedExpired` was missing entirely,
 *  and `Delivered`'s real value is 3, not 2. `getRequestStatus`'s own body (also read directly,
 *  not inferred) confirms exactly when each applies: DoesNotExist when no priorityMech is
 *  recorded; RequestedPriority while still within the priority mech's response window and
 *  undelivered; RequestedExpired once that window has passed with no delivery (at which point ANY
 *  mech, not just the original priorityMech, may deliver it — see mechAdapter.ts's task-intake
 *  doc comment for why this adapter only watches its own priorityMech requests for now, not this
 *  fallback case). */
export const REQUEST_STATUS = {
  DOES_NOT_EXIST: 0,
  REQUESTED_PRIORITY: 1,
  REQUESTED_EXPIRED: 2,
  DELIVERED: 3,
} as const;
