// Gnosis Safe v1.3.0 ABI subset — the real deployed multisig backing Grey's mech service (BION-
// DIRECTIVE-38). Source: safe-global/safe-contracts's contracts/GnosisSafe.sol at the v1.3.0 tag
// (raw-fetched, 2026-08-11), NOT reconstructed from memory/docs — confirmed this is genuinely the
// version in use by reading the real deployed multisig's own `VERSION()` (returns "1.3.0") and its
// storage slot 0 (Safe proxies store their singleton address there), which resolves to
// `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` — the real canonical Safe v1.3.0 singleton, not a
// fork or custom variant.
//
// `execTransaction`'s signature packed format ({bytes32 r}{bytes32 s}{uint8 v}) and the plain-
// ECDSA (non-eth_sign) verification branch (v ∈ {27,28}, `ecrecover(dataHash, v, r, s)` directly,
// no EIP-191 prefix) are traced from `checkNSignatures`'s real source — see safeDeliveryClient.ts's
// file header for the full citation and the empirically-verified storage layout (owners mapping
// base slot = 2, confirmed by reading real storage against the real live multisig, not derived
// from inheritance order alone).
import { parseAbi } from 'viem';

export const SAFE_ABI = parseAbi([
  'function VERSION() view returns (string)',
  'function nonce() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function domainSeparator() view returns (bytes32)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
  'event ExecutionSuccess(bytes32 txHash, uint256 payment)',
  'event ExecutionFailure(bytes32 txHash, uint256 payment)',
]);

/** `Enum.Operation.Call` (safe-contracts's contracts/common/Enum.sol) — the only operation this
 *  adapter ever uses; `DelegateCall` (1) is deliberately never exposed here (arbitrary delegatecall
 *  from a multisig is a well-known rug vector, and nothing this adapter does needs it). */
export const SAFE_OPERATION_CALL = 0;

/** Real canonical Safe v1.3.0 singleton address, confirmed live (see file header) — reference only,
 *  this adapter never calls the singleton directly (always through the proxy). */
export const SAFE_V1_3_0_SINGLETON = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552' as const;
