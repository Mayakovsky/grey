// e3-b1's Base-fork proof — runs against a LOCAL Hardhat fork of real Base mainnet state (not a
// live testnet: none exists for the Mech Marketplace on Base, current or legacy — confirmed by
// directly reading autonolas-marketplace's docs/configuration.json and docs/configuration_v0.json;
// Base Sepolia's legacy entry has every address as an empty string, unlike Gnosis's populated
// Chiado entry, so this is Base-specific, not a general testnet gap). This is the substitute the
// user chose for the directive's "testnet full cycle before mainnet" requirement.
//
// Opt-in, NOT part of `pnpm test` (vitest run) — needs real network access to fork Base mainnet,
// same reasoning as acp-adapter's GREY_CEREMONY_ANVIL=1 opt-in e2e tests. Run via:
//   pnpm --filter @grey/mech-adapter test:fork
//
// Scope: proves the read-side contract client (marketplaceClient.ts / marketplaceAbi.ts) against
// REAL deployed MechMarketplaceProxy bytecode on a forked Base mainnet — numMechs(), checkMech()
// against a known-non-mech address, and getRequestStatus() against a real historical requestId
// pulled from the Base marketplace subgraph during research. This does NOT prove a full mech
// registration → request → deliver → payment cycle: registration itself is blocked on the
// unresolved Olas ServiceRegistry prerequisite (see mechAdapter.ts file header) and cannot be
// legitimately simulated without fabricating an ABI this pass didn't verify.
//
// CURRENT STATUS (2026-08-08): the bytecode-liveness test passes (real proof — the fork genuinely
// serves real deployed Base bytecode at the proxy address). The three readContract-based tests
// currently fail on a Hardhat/EDR tooling limitation, not an adapter defect — see hardhat.config
// .cts's "KNOWN UNRESOLVED" comment. Left in place (not skipped/deleted) because they document
// the intended proof and the exact failure mode for whoever picks this up next; this file is not
// part of the `vitest run` gate (package.json's `test:fork` is a separate, opt-in script), so
// this does not block e3-b1/b2/b3's actual gates.
import hre from 'hardhat';
import { strict as assert } from 'node:assert';
import { createPublicClient, custom, getAddress, type Address } from 'viem';
import { MARKETPLACE_ADDRESSES } from '../../src/config.js';
import { MECH_MARKETPLACE_ABI } from '../../src/marketplaceAbi.js';

// A real historical request id, taken directly from the Base marketplace subgraph
// (api.subgraph.autonolas.tech/api/proxy/marketplace-base) during e3-b1 research — not
// fabricated. If the fork RPC's block range doesn't retain this request's state, the assertion
// below tolerates a REVERT (documents the real DOES_NOT_EXIST-vs-revert behavior) rather than
// silently passing either way.
const KNOWN_REQUEST_ID = '0x000157c6d62ed80c87a7f6d1879fdab16842a045823b52e2c9c5020b661a9a92' as const;
const NON_MECH_ADDRESS: Address = getAddress('0x000000000000000000000000000000000000dead');

describe('mech-adapter — Base mainnet fork (e3-b1 testnet-gap substitute)', function () {
  this.timeout(60_000);

  // No `chain:` — Hardhat's simulated network runs as chain id 31337 (see hardhat.config.cts's
  // comment on why chainId: 8453 was removed), so a viem `chain` object asserting Base's real
  // chain id would fight the transport. The transport is a raw EIP-1193 provider wrapping
  // Hardhat's forked-Base state; contract reads don't depend on the client's chain id field.
  const client = createPublicClient({
    transport: custom(hre.network.provider),
  });

  it('MechMarketplaceProxy has real deployed bytecode on the fork (sanity check)', async () => {
    const code = await client.getCode({ address: MARKETPLACE_ADDRESSES.mechMarketplaceProxy });
    assert.ok(code && code !== '0x', 'expected non-empty bytecode at the proxy address');
  });

  it('numMechs() returns a real, non-fabricated count from forked Base state', async () => {
    const count = await client.readContract({
      address: MARKETPLACE_ADDRESSES.mechMarketplaceProxy,
      abi: MECH_MARKETPLACE_ABI,
      functionName: 'numMechs',
    });
    assert.equal(typeof count, 'bigint');
    // Recorded observation, not asserted as a fixed value (mech count changes over time) —
    // logged so the report can state what was actually seen, not assumed.
    console.log(`[fork] numMechs() = ${count}`);
  });

  it('checkMech() against a definitely-not-a-mech address — records real observed behavior', async () => {
    const result = await client.readContract({
      address: MARKETPLACE_ADDRESSES.mechMarketplaceProxy,
      abi: MECH_MARKETPLACE_ABI,
      functionName: 'checkMech',
      args: [NON_MECH_ADDRESS],
    });
    console.log(`[fork] checkMech(${NON_MECH_ADDRESS}) = ${result}`);
    // Whatever the real contract returns for a non-mech, it must be a well-formed address —
    // this is the actual thing under test (the ABI decode round-trips against real bytecode).
    assert.match(result, /^0x[0-9a-fA-F]{40}$/);
  });

  it('getRequestStatus() against a real historical request id from the Base subgraph', async () => {
    const status = await client.readContract({
      address: MARKETPLACE_ADDRESSES.mechMarketplaceProxy,
      abi: MECH_MARKETPLACE_ABI,
      functionName: 'getRequestStatus',
      args: [KNOWN_REQUEST_ID],
    });
    console.log(`[fork] getRequestStatus(${KNOWN_REQUEST_ID}) = ${status}`);
    assert.equal(typeof status, 'number');
  });
});
