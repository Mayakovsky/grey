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
// `create`'s `token` param: address(0) selects native-ETH bonding (per ServiceRegistryTokenUtility
// only being consulted for a non-zero token address — confirmed by its absence from every real
// recent Base service's bonding path, see mechAdapter.ts's registerAsMech doc comment). Grey's
// posture uses address(0) — no ERC20 bonding token wired here.
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
