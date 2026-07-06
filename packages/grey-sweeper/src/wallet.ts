import { privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';

/**
 * Load the GREY_AGENT_WALLET signer from a raw private key.
 * The key comes from {@link SweeperConfig.agentWalletPrivateKey} (env-loaded).
 */
export function loadAgentAccount(privateKey: `0x${string}`): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}
