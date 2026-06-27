import { erc20Abi } from 'viem';
import type { Address } from 'viem';

/**
 * Minimal public-client surface we depend on — kept tiny so tests can inject a
 * mock without constructing a full viem client.
 */
export interface PublicClientLike {
  readContract(args: {
    address: Address;
    abi: typeof erc20Abi;
    functionName: 'balanceOf';
    args: readonly [Address];
  }): Promise<bigint>;
}

/** Read the USDC balance of `wallet` via `balanceOf`. */
export async function readUsdcBalance(
  client: PublicClientLike,
  usdcAddress: Address,
  wallet: Address,
): Promise<bigint> {
  return client.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  });
}
