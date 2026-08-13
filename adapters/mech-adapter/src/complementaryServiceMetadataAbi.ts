// ComplementaryServiceMetadata — the real, standalone contract that associates a service with its
// off-chain metadata document hash, DISTINCT from ServiceRegistryL2's own `configHash` (BION-
// DIRECTIVE-53/54's finding: `createMech()`'s `payload` argument is NOT this — it's a raw uint256
// delivery rate for the FixedPriceNative family; this contract is the real, correct place for a
// service-level metadata hash). Real, deployed Base mainnet address and real ABI, both traced from
// primary source, not guessed:
//   - Address confirmed via `valory-xyz/autonolas-subgraph`'s real subgraph manifest
//     (subgraphs/marketplace/subgraph.base.yaml, the `ComplementaryServiceMetadata` data source).
//   - ABI fetched raw from that same repo (abis/ComplementaryServiceMetadata.json).
//   - Access control traced from real source (valory-xyz/autonolas-registries,
//     contracts/utils/ComplementaryServiceMetadata.sol): `isAbleChangeHash(account, serviceId)`
//     requires `account == multisig` when the service is `Deployed` (Grey's real state) — NOT the
//     service owner/payToAddress. Confirmed live: `isAbleChangeHash(BASE_MECH_PAY_TO, 635)` is
//     false, `isAbleChangeHash(GREY_MECH_MULTISIG_ADDRESS, 635)` is true (D-53/D-54).
import { parseAbi } from 'viem';
import type { Address } from 'viem';

export const COMPLEMENTARY_SERVICE_METADATA_ADDRESS: Address = '0x28C1edC7CEd549F7f80B732fDC19f0370160707d';

export const COMPLEMENTARY_SERVICE_METADATA_ABI = parseAbi([
  'function changeHash(uint256 serviceId, bytes32 hash)',
  'function isAbleChangeHash(address account, uint256 serviceId) view returns (bool)',
  'function mapServiceHashes(uint256 serviceId) view returns (bytes32)',
  'function serviceRegistry() view returns (address)',
  'event ComplementaryMetadataUpdated(uint256 indexed serviceId, bytes32 indexed hash)',
]);
