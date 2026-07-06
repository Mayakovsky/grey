// Layer 3 — ERC-8004 `register()` call-data construction.

import { decodeEventLog, encodeFunctionData, parseAbi } from 'viem';
import type { Hex, Log } from 'viem';

export const REGISTER_ABI = parseAbi([
  'function register() returns (uint256 tokenId)',
  'event Registered(uint256 indexed tokenId, address indexed owner)',
]);

/** Encode a bare `register()` call. */
export function encodeRegister(): Hex {
  return encodeFunctionData({ abi: REGISTER_ABI, functionName: 'register', args: [] });
}

/**
 * Scan transaction logs for the `Registered` event and return its tokenId.
 * Returns null if no matching event was found.
 */
export function parseRegisteredTokenId(logs: readonly Log[]): bigint | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: REGISTER_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'Registered',
      });
      return decoded.args.tokenId;
    } catch {
      // not this event; keep scanning
    }
  }
  return null;
}
