// Layer 3 — ERC-8004 `register()` call-data construction.

import { decodeEventLog, encodeFunctionData, parseAbi, zeroAddress } from 'viem';
import type { Hex, Log } from 'viem';

export const REGISTER_ABI = parseAbi([
  'function register() returns (uint256 tokenId)',
  // The deployed ERC-8004 singleton emits Registered with a middle `agentURI`
  // string param (topic0 0xca52e62c…) — NOT the 2-field form. Confirmed on-chain
  // against the Base Sepolia registry mint (FDQ-24). The mainnet singleton is the
  // same CREATE2 deployment, so this signature holds on both chains.
  'event Registered(uint256 indexed tokenId, string agentURI, address indexed owner)',
]);

// Every ERC-721 mint emits Transfer(from=0x0, to=owner, tokenId). We parse this
// as a chain-agnostic fallback for the tokenId, independent of the registry's
// own event vocabulary (FDQ-24 Option C).
const ERC721_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

/** Encode a bare `register()` call. */
export function encodeRegister(): Hex {
  return encodeFunctionData({ abi: REGISTER_ABI, functionName: 'register', args: [] });
}

/** Scan logs for the ERC-8004 `Registered` event; return its tokenId or null. */
function tokenIdFromRegistered(logs: readonly Log[]): bigint | null {
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

/** Scan logs for the ERC-721 mint `Transfer(from=0x0)`; return its tokenId or null. */
function tokenIdFromMintTransfer(logs: readonly Log[]): bigint | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC721_TRANSFER_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'Transfer',
      });
      if (decoded.args.from.toLowerCase() === zeroAddress) {
        return decoded.args.tokenId;
      }
    } catch {
      // not an ERC-721 Transfer (e.g. ERC-20 Transfer has a non-indexed value); skip
    }
  }
  return null;
}

/**
 * Extract the minted tokenId from a `register()` receipt's logs.
 *
 * Reads two independent sources — the ERC-8004 `Registered` event and the
 * ERC-721 mint `Transfer(from=0x0)` — and cross-checks them (FDQ-24 Option C).
 * If BOTH resolve a tokenId and they DISAGREE, throws loudly rather than
 * silently preferring either path. Returns whichever single source resolves, or
 * null if neither does.
 */
export function parseRegisteredTokenId(logs: readonly Log[]): bigint | null {
  const fromEvent = tokenIdFromRegistered(logs);
  const fromTransfer = tokenIdFromMintTransfer(logs);
  if (fromEvent !== null && fromTransfer !== null && fromEvent !== fromTransfer) {
    throw new Error(
      `register(): tokenId mismatch — Registered event says ${fromEvent}, ` +
        `ERC-721 mint Transfer says ${fromTransfer}. Refusing to guess.`,
    );
  }
  return fromEvent ?? fromTransfer;
}
