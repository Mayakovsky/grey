// Layer 3 — ERC-8004 read-only call encodings: `ownerOf` + `getAgentWallet`.

import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';

export const READS_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getAgentWallet(uint256 tokenId) view returns (address)',
]);

export function encodeOwnerOf(tokenId: bigint): Hex {
  return encodeFunctionData({ abi: READS_ABI, functionName: 'ownerOf', args: [tokenId] });
}

export function encodeGetAgentWallet(tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: READS_ABI,
    functionName: 'getAgentWallet',
    args: [tokenId],
  });
}

export function decodeOwnerOf(data: Hex): Address {
  return decodeFunctionResult({ abi: READS_ABI, functionName: 'ownerOf', data }) as Address;
}

export function decodeGetAgentWallet(data: Hex): Address {
  return decodeFunctionResult({
    abi: READS_ABI,
    functionName: 'getAgentWallet',
    data,
  }) as Address;
}
