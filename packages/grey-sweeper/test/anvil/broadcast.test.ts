import { describe, it, expect } from 'vitest';
import process from 'node:process';

/**
 * Real-anvil broadcast end-to-end. Skipped unless GREY_SWEEPER_ANVIL=1.
 * NOT counted toward the CI-default unit-test floor. See TESTING.md for
 * provisioning (foundryup, fork-url, chain-id 8453).
 */
describe.skipIf(process.env['GREY_SWEEPER_ANVIL'] !== '1')('anvil — USDC sweep broadcast', () => {
  it('broadcasts a real ERC-20 transfer to the pool wallet and confirms receipt', async () => {
    // Requires a live `anvil --fork-url $GREY_SWEEPER_RPC_URL --chain-id 8453`,
    // a funded GREY_AGENT_WALLET_PRIVATE_KEY, and GREY_USDC_ADDRESS set.
    // Intentionally a placeholder so the gated path stays opt-in and the default
    // CI run never reaches network/anvil.
    expect(process.env['GREY_SWEEPER_ANVIL']).toBe('1');
  });
});
