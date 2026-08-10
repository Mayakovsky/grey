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

export const SERVICE_MANAGER_ABI = parseAbi([
  'function create(address serviceOwner, address token, bytes32 configHash, uint32[] agentIds, (uint32 slots, uint96 bond)[] agentParams, uint32 threshold) returns (uint256 serviceId)',
  'function activateRegistration(uint256 serviceId) payable returns (bool success)',
  'function registerAgents(uint256 serviceId, address[] agentInstances, uint32[] agentIds) payable returns (bool success)',
  'function deploy(uint256 serviceId, address multisigImplementation, bytes data) returns (address multisig)',
]);

export const SERVICE_REGISTRY_L2_ABI = parseAbi([
  'function getService(uint256 serviceId) view returns ((uint96 securityDeposit, address multisig, bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, uint8 state, uint32[] agentIds) service)',
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
