// Olas ServiceRegistry lifecycle ABI subset (BION-DIRECTIVE-28). Every signature below is copied
// verbatim from the REAL deployed ABIs, fetched raw (not paraphrased, not hand-transcribed from
// docs) from valory-xyz/autonolas-registries:
//   - abis/0.8.30/ServiceManager.json — create/activateRegistration/registerAgents/deploy. This
//     is the entry point callers actually use (via ServiceManagerProxy); note its signatures
//     differ from the lower-level ServiceRegistryL2 ones (ServiceManager infers serviceOwner/
//     operator from msg.sender and adds a `token` param to `create` for ERC20 bonding — confirmed
//     against the ABI, not assumed from ServiceRegistryL2's shape).
//   - abis/0.8.23/ServiceRegistryL2.json — getService, for reading existing-service state before
//     deciding whether create() is even needed.
//
// `create`'s `token` param: CORRECTED (BION-DIRECTIVE-29) — address(0) is NOT the native-ETH
// selector. The real contract explicitly reverts `ZeroAddress()` on a zero token (confirmed live
// against Base mainnet); native ETH has its own dedicated sentinel instead, `ETH_TOKEN_ADDRESS`
// (config.ts) — any other nonzero address routes through the ERC20/ServiceRegistryTokenUtility
// bonding path. Grey's posture passes `ETH_TOKEN_ADDRESS`, not address(0). See config.ts's own
// doc comment on ETH_TOKEN_ADDRESS for the full citation and live cross-check.
import { parseAbi } from 'viem';

/** Real custom errors (BION-DIRECTIVE-33 Task 3) — every signature copied verbatim from the real
 *  source, not guessed: `IErrorsRegistries.sol` (shared by ServiceManager/ServiceRegistryL2, the
 *  full declared set, not just the two this project happened to hit so far), plus
 *  `ServiceRegistryTokenUtility.sol`'s own `TokenRejected` and `ServiceManager.sol`'s own
 *  `AlreadyInitialized`/`MultisigAlreadyBound`. Without these in the ABI, viem can't decode a
 *  custom-error revert and only prints the bare 4-byte selector — which is exactly what happened
 *  in D-29 (`0xd92e233d`/`0xe77376f3`) and D-32 (`0xf014fe74`), each requiring a human to
 *  hand-compute candidate selectors and match them by hand. `0xe77376f3` is now known to be
 *  `TokenRejected(address)` — resolved as a side effect of building this list from the real
 *  source, not left as D-29's unresolved loose end. */
const REGISTRY_ERRORS = [
  'error ManagerOnly(address sender, address manager)',
  'error OwnerOnly(address sender, address owner)',
  'error HashExists()',
  'error ZeroAddress()',
  'error WrongAgentId(uint256 agentId)',
  'error WrongArrayLength(uint256 numValues1, uint256 numValues2)',
  'error AgentNotFound(uint256 agentId)',
  'error ComponentNotFound(uint256 componentId)',
  'error WrongThreshold(uint256 currentThreshold, uint256 minThreshold, uint256 maxThreshold)',
  'error AgentInstanceRegistered(address operator)',
  'error WrongOperator(uint256 serviceId)',
  'error OperatorHasNoInstances(address operator, uint256 serviceId)',
  'error AgentNotInService(uint256 agentId, uint256 serviceId)',
  'error Paused()',
  'error ZeroValue()',
  'error Overflow(uint256 provided, uint256 max)',
  'error ServiceMustBeInactive(uint256 serviceId)',
  'error AgentInstancesSlotsFilled(uint256 serviceId)',
  'error WrongServiceState(uint256 state, uint256 serviceId)',
  'error OnlyOwnServiceMultisig(address provided, address expected, uint256 serviceId)',
  'error UnauthorizedMultisig(address multisig)',
  'error IncorrectRegistrationDepositValue(uint256 sent, uint256 expected, uint256 serviceId)',
  'error IncorrectAgentBondingValue(uint256 sent, uint256 expected, uint256 serviceId)',
  'error TransferFailed(address token, address from, address to, uint256 value)',
  'error ReentrancyGuard()',
  'error AlreadyInitialized()',
  'error MultisigAlreadyBound(address multisig, uint256 existingServiceId, uint256 serviceId)',
  'error TokenRejected(address token)',
] as const;

export const SERVICE_MANAGER_ABI = parseAbi([
  'function create(address serviceOwner, address token, bytes32 configHash, uint32[] agentIds, (uint32 slots, uint96 bond)[] agentParams, uint32 threshold) returns (uint256 serviceId)',
  'function activateRegistration(uint256 serviceId) payable returns (bool success)',
  'function registerAgents(uint256 serviceId, address[] agentInstances, uint32[] agentIds) payable returns (bool success)',
  'function deploy(uint256 serviceId, address multisigImplementation, bytes data) returns (address multisig)',
  ...REGISTRY_ERRORS,
]);

export const SERVICE_REGISTRY_L2_ABI = parseAbi([
  'function getService(uint256 serviceId) view returns ((uint96 securityDeposit, address multisig, bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, uint8 state, uint32[] agentIds) service)',
  ...REGISTRY_ERRORS,
]);

/** ServiceRegistryL2.ServiceState enum, positional (enums compile to bare uint8 — confirmed
 *  against the enum declaration order in ServiceRegistryL2.sol, not inferred). */
export const SERVICE_STATE = {
  NonExistent: 0,
  PreRegistration: 1,
  ActiveRegistration: 2,
  FinishedRegistration: 3,
  Deployed: 4,
  TerminatedBonded: 5,
} as const;
