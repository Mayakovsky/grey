import type { Address } from 'viem';

/**
 * E2-BE scope cut (Forces ruling, EXPANSION-E2-BE-REVISED-KOV-directive.md): no automated
 * refuel for Kite this phase — the Uniswap-v3-swap assumption underneath the existing
 * refuel/ pipeline (packages/grey-sweeper/src/refuel/) is unverified on Kite (native gas
 * token is KITE, not ETH; no confirmed DEX liquidity). Manual gas funding "to start," per
 * Forces directly: *squirt some lighter fluid on the grill and light the match*. This module
 * is the read-only substitute — reports a wallet's native-gas balance against a floor so a
 * human knows when to top up manually. Never signs, never moves funds, no scheduling.
 */

export interface NativeBalanceClientLike {
  getBalance(args: { address: Address }): Promise<bigint>;
}

export type GasBalanceStatus = 'ok' | 'below_floor';

export interface GasBalanceCheckResult {
  address: Address;
  balanceWei: bigint;
  floorWei: bigint;
  status: GasBalanceStatus;
}

/** Read-only: balanceWei < floorWei => 'below_floor'. Never throws on its own logic — a
 *  `getBalance` rejection propagates to the caller, same as any other RPC read failure. */
export async function checkGasBalance(
  client: NativeBalanceClientLike,
  address: Address,
  floorWei: bigint,
): Promise<GasBalanceCheckResult> {
  const balanceWei = await client.getBalance({ address });
  return {
    address,
    balanceWei,
    floorWei,
    status: balanceWei < floorWei ? 'below_floor' : 'ok',
  };
}

/** Plain-text one-liner for a log line / on-demand script — not a data structure a caller
 *  should parse; format however the eventual consumer prefers. */
export function formatGasBalanceCheck(result: GasBalanceCheckResult): string {
  const label = result.status === 'ok' ? 'OK' : 'BELOW FLOOR — top up manually';
  return `gas-balance: ${result.address} = ${result.balanceWei} wei (floor ${result.floorWei} wei) — ${label}`;
}
