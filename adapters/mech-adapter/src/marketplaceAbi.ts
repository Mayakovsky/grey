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

export const MECH_MARKETPLACE_ABI = parseAbi([
  'function numMechs() view returns (uint256)',
  'function checkMech(address mech) view returns (address)',
  'function getRequestStatus(bytes32 requestId) view returns (uint8)',
  'function getRequestId(address mech, address requester, bytes data, uint256 deliveryRate, bytes32 paymentType, uint256 nonce) view returns (bytes32)',
  'function mapRequestIdInfos(bytes32) view returns (address,address,address,uint256,uint256,bytes32)',
  'function mapMechDeliveryCounts(address) view returns (uint256)',
  'function deliverMarketplace(bytes32[] requestIds, uint256[] deliveryRates) returns (bool[])',
  'event CreateMech(address mech, uint256 serviceId, address mechFactory)',
  'event MarketplaceRequest(address priorityMech, address requester, uint256 numRequests, bytes32[] requestIds, bytes[] requestDatas)',
  'event MarketplaceDelivery(address deliveryMech, address[] requesters, uint256 numDeliveries, bytes32[] requestIds, bool[] deliveredRequests)',
]);

// MechFactoryFixedPriceNative — also verified raw (abis/0.8.28/MechFactoryFixedPriceNative.json).
// `createMech` requires a pre-existing Olas `serviceId` from the ServiceRegistry contract — see
// mechAdapter.ts's registerAsMech doc comment for why this adapter does not call it yet.
export const MECH_FACTORY_ABI = parseAbi([
  'function createMech(address serviceRegistry, uint256 serviceId, bytes payload) returns (address)',
  'event CreateMechFixedPriceNative(address mech, uint256 serviceId, uint256 maxDeliveryRate)',
]);

/** Request lifecycle status, per getRequestStatus's uint8 return. Values inferred from the
 *  MarketplaceRequest/MarketplaceDelivery event pair and mapRequestIdInfos' shape (requester,
 *  mech, priorityMech, timestamps, paymentType) — NOT independently confirmed against an enum
 *  definition in the ABI (enums compile to bare uint8, the name is erased). Treat as a strong
 *  inference, not a verified fact — flagged in the e3-b1 report. */
export const REQUEST_STATUS = {
  DOES_NOT_EXIST: 0,
  REQUESTED: 1,
  DELIVERED: 2,
} as const;
