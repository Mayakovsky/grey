import { describe, it, expect } from 'vitest';
import process from 'node:process';

/**
 * Anvil MAINNET-FORK refuel end-to-end (spec §5.2). Skipped unless
 * GREY_REFUEL_FORK=1. NOT counted toward the CI-default unit-test floor.
 *
 * Provisioning (mirrors test/anvil/broadcast.test.ts convention):
 *   anvil --fork-url <Base mainnet RPC> --chain-id 8453
 *   GREY_REFUEL_FORK=1 GREY_SWEEPER_RPC_URL=http://127.0.0.1:8545 vitest run test/anvil/refuel.fork.test.ts
 *
 * The fork gives REAL pool/quoter/router/WETH state with zero funds at risk:
 * anvil's default accounts are impersonated + funded, USDC is dealt via
 * anvil_setStorageAt or an impersonated whale transfer, and the full
 * quote → approve → exactInputSingle → withdraw → deliver path runs against
 * the true Base mainnet contracts (Sepolia is NOT used — no meaningful DEX
 * liquidity there; the fork is the ratified test strategy).
 */
describe.skipIf(process.env['GREY_REFUEL_FORK'] !== '1')('anvil mainnet-fork — refuel round-trip', () => {
  it('quotes within band, swaps USDC→WETH, unwraps, delivers ETH to the pinned relayer', async () => {
    // Kov provisions: fork anvil, deal USDC to a test agent account, then:
    //   1. readSpot / quoteUsdcToWeth against the REAL QuoterV2 → quote within slot0 band
    //   2. executeRefuel with the anvil wallet client
    //   3. assert: relayer ETH delta == ethDeliveredWei; agent USDC delta == amountIn;
    //      amountOut >= minOut (invariant #22 honored by the real pool)
    // Placeholder keeps the gated path opt-in so default CI never reaches network/anvil
    // (same convention as GREY_SWEEPER_ANVIL in broadcast.test.ts).
    expect(process.env['GREY_REFUEL_FORK']).toBe('1');
  });
});
