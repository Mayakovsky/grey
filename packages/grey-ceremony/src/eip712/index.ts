// Layer 3 — eip712 public surface.
export {
  AGENT_WALLET_SET_TYPE_STRING,
  AGENT_WALLET_SET_TYPES,
  PRIMARY_TYPE,
  REGISTRY_BY_CHAIN_ID,
  agentWalletSetDigest,
  buildDomain,
  resolveRegistry,
  typehash,
} from './agent-wallet-set.ts';
export type { AgentWalletSetMessage } from './agent-wallet-set.ts';
