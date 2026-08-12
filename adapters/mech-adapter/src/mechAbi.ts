// The individual Mech contract's own ABI — distinct from marketplaceAbi.ts's MechMarketplace/
// MechFactory ABIs. `deliverToMarketplace` is the function a mech's operator (the service's real
// Safe multisig, see safeDeliveryClient.ts) calls to deliver task results (BION-DIRECTIVE-38).
//
// Source: valory-xyz/ai-registry-mech's contracts/OlasMech.sol (raw-fetched, 2026-08-11) — the
// abstract base every concrete Mech variant (contracts/mechs/native/*, etc.) inherits from
// unmodified. `onlyOperator` (Mech.sol, same repo's lib/gnosis-mech submodule) requires
// `isOperator(msg.sender)`; OlasMech's `isOperator` requires `msg.sender === getOperator()`, which
// reads the service's real multisig LIVE from `ServiceRegistry.mapServices(serviceId)` (reverting
// `WrongServiceState` unless the service is `Deployed`) — confirmed by reading the real source, not
// assumed from the ceremony runbook's paraphrase (config.ts's BASE_MECH_AGENT_INSTANCE_ADDRESS doc
// comment). This is why `deliverToMarketplace` can't be called directly by the agent-instance EOA:
// `msg.sender` must literally be the multisig contract, reached only via its own `execTransaction`
// (safeDeliveryClient.ts).
import { parseAbi } from 'viem';

export const OLAS_MECH_ABI = parseAbi([
  'function deliverToMarketplace(bytes32[] requestIds, bytes[] datas) returns (bool[] deliveredRequests)',
  'function paymentType() view returns (bytes32)',
  'function maxDeliveryRate() view returns (uint256)',
  'function mechMarketplace() view returns (address)',
  'function serviceId() view returns (uint256)',
  'function numTotalDeliveries() view returns (uint256)',
  'event Deliver(address indexed mech, address indexed mechServiceMultisig, bytes32 requestId, uint256 deliveryRate, bytes data)',
  'event RevokeRequest(bytes32 requestId)',
]);
