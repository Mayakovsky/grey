// Layer 3 — ERC-8004 `setAgentWallet(...)` call-data construction.

import { encodeFunctionData, parseAbi } from 'viem';
import type { Address, Hex } from 'viem';

export const SET_AGENT_WALLET_ABI = parseAbi([
  'function setAgentWallet(uint256 tokenId, address newWallet, uint256 deadline, bytes signature)',
]);

/** Encode `setAgentWallet(tokenId, newWallet, deadline, signature)`. */
export function encodeSetAgentWallet(
  tokenId: bigint,
  newWallet: Address,
  deadline: bigint,
  signature: Hex,
): Hex {
  return encodeFunctionData({
    abi: SET_AGENT_WALLET_ABI,
    functionName: 'setAgentWallet',
    args: [tokenId, newWallet, deadline, signature],
  });
}
