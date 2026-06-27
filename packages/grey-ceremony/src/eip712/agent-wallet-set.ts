// Layer 3 — EIP-712 typed-data for the ERC-8004 `AgentWalletSet` consent.

import { hashTypedData, keccak256, toBytes } from 'viem';
import type { Address, Hex, TypedDataDomain } from 'viem';

/** Default IdentityRegistry addresses by chainId. */
export const REGISTRY_BY_CHAIN_ID: Record<number, Address> = {
  8453: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', // Base mainnet
  84532: '0x8004A818BFB912233c491871b3d84c89A494BD9e', // Base Sepolia testnet
};

/** Resolve a registry address: explicit override wins, else chainId default. */
export function resolveRegistry(chainId: number, override?: Address): Address {
  if (override) return override;
  const reg = REGISTRY_BY_CHAIN_ID[chainId];
  if (!reg) {
    throw new Error(
      `No default registry for chainId ${chainId}; pass --registry`,
    );
  }
  return reg;
}

export const AGENT_WALLET_SET_TYPES = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const PRIMARY_TYPE = 'AgentWalletSet' as const;

/** The EIP-712 type string, exactly as encoded for the typehash. */
export const AGENT_WALLET_SET_TYPE_STRING =
  'AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)';

/** keccak256 of the type string (the EIP-712 typehash). */
export function typehash(): Hex {
  return keccak256(toBytes(AGENT_WALLET_SET_TYPE_STRING));
}

export interface AgentWalletSetMessage {
  agentId: bigint;
  newWallet: Address;
  owner: Address;
  deadline: bigint;
}

/** Build the EIP-712 domain for the IdentityRegistry. */
export function buildDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: 'ERC8004IdentityRegistry',
    version: '1',
    chainId,
    verifyingContract,
  };
}

/** Compute the EIP-712 signing digest for an AgentWalletSet message. */
export function agentWalletSetDigest(
  chainId: number,
  verifyingContract: Address,
  message: AgentWalletSetMessage,
): Hex {
  return hashTypedData({
    domain: buildDomain(chainId, verifyingContract),
    types: AGENT_WALLET_SET_TYPES,
    primaryType: PRIMARY_TYPE,
    message,
  });
}
