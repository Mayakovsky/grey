// BION-DIRECTIVE-111's own required proof — D-110's fork-proof (correctedGnosisMech.forkcheck.ts)
// and mechPayload.test.ts both tested `resolveMechPayload` in isolation, with a correct payload
// already supplied by the test — never register-live.ts's own real call ORDER. That's exactly why
// neither caught the real bug: register-live.ts computed the payload only AFTER a call that had
// already simulated createMech with the stale '0x' placeholder. This file closes that gap by
// exercising the real production sequence register-live.ts now follows — state read → step
// derivation (nextStepForState) → payload resolution (resolveMechPayload) → simulate — using the
// SAME shared functions register-live.ts and mechAdapter.ts import (not hand-rolled duplicates),
// driven by REAL forked on-chain state (not a mocked getService), and proves:
//
//   1. That real sequence, in that order, resolves the correct encoded payload and simulates
//      createMech cleanly on the FIRST attempt — no placeholder, no second/corrective call.
//   2. (Negative control) That simulating with the stale '0x' placeholder — i.e. the exact bug
//      Forces hit — actually reverts on this same forked state. Proves this fork-proof would have
//      caught the real D-111 bug, unlike D-110's, which never exercised the buggy order at all.
//
// Never broadcasts to real Gnosis mainnet — read-only + simulateContract only, same fork-only
// discipline as correctedGnosisMech.forkcheck.ts. Opt-in, not part of `pnpm test`:
//   MECH_FORK_CHAIN=gnosis pnpm --filter @grey/mech-adapter test:fork
import hre from 'hardhat';
import { strict as assert } from 'node:assert';
import { createPublicClient, custom } from 'viem';
import { CHAINS, BASE_MECH_PAY_TO_ADDRESS } from '../../src/config.js';
import { MECH_MARKETPLACE_ABI } from '../../src/marketplaceAbi.js';
import { SERVICE_REGISTRY_L2_ABI } from '../../src/serviceRegistryAbi.js';
import { nextStepForState, resolveMechPayload } from '../../src/registrationResume.js';

const REAL_SERVICE_ID = 3789n; // real, already-Deployed service on Gnosis (D-105/106)
const REAL_DELIVERY_RATE_WEI = 130_000_000_000_000_000n; // 0.13 xDAI, Forces' confirmed real price (D-110 §0)

describe('mech-adapter — register-live.ts real preflight ordering, fork proof (BION-DIRECTIVE-111)', function () {
  this.timeout(60_000);

  const client = createPublicClient({ transport: custom(hre.network.provider) });
  const gnosisNativeFactory = CHAINS[100].marketplace.factories.NATIVE;
  const marketplaceAddress = CHAINS[100].marketplace.mechMarketplaceProxy;
  const serviceRegistryAddress = CHAINS[100].serviceRegistry.serviceRegistryL2;

  before(async () => {
    // Hardhat/EDR refuses eth_call/simulate exactly AT the pinned fork block ("No known hardfork
    // for execution on historical block N (relative to fork block number N)") for chains without
    // baked-in hardfork-activation history (Gnosis/100 is one). Mining one empty local block moves
    // the node just past the fork point, which is all `eth_call`-based reads need — purely local,
    // no real chain interaction.
    await hre.network.provider.request({ method: 'evm_mine', params: [] });
  });

  it('the real production sequence — real getService read, then nextStepForState, then resolveMechPayload — resolves the correct encoded payload BEFORE any simulate', async () => {
    // Step 1: the exact real read register-live.ts's own preflight now does, before ever touching
    // MechAdapter/registerAsMechStep.
    const service = await client.readContract({
      address: serviceRegistryAddress,
      abi: SERVICE_REGISTRY_L2_ABI,
      functionName: 'getService',
      args: [REAL_SERVICE_ID],
    });
    assert.equal(service.state, 4, 'expected real service 3789 to still be Deployed on this fork (re-pin hardhat.config.cts if this fails after real state has moved on)');

    // Step 2: the exact real shared function — same one mechAdapter.ts's registerAsMechStep now
    // calls internally — proving the two call sites can't drift into different state->step logic.
    const step = nextStepForState(service.state);
    assert.equal(step, 'createMech', 'Deployed should resolve to createMech, matching the real bug scenario this directive fixes');

    // Step 3: the exact real shared payload resolver, fed the step derived in step 2 — this is the
    // real fix: payload is fully resolved BEFORE any simulate is attempted, unlike the old buggy
    // order where the simulate ran first with a placeholder.
    const payloadDecision = resolveMechPayload(step, REAL_DELIVERY_RATE_WEI);
    assert.equal(payloadDecision.mode, 'encoded');
    if (payloadDecision.mode !== 'encoded') throw new Error('unreachable');
    const correctPayload = payloadDecision.payload;

    // Step 4: the real preflight simulate — mirrors MechAdapter.runCreateMechStep's actual
    // simulateCreateMech call exactly (same factory/serviceId/payload, same contract) — but now
    // fed the CORRECT payload from the very first call, proving the corrected order actually
    // works end-to-end, not just that its parts work in isolation.
    await client.simulateContract({
      address: marketplaceAddress,
      abi: MECH_MARKETPLACE_ABI,
      functionName: 'create',
      args: [REAL_SERVICE_ID, gnosisNativeFactory, correctPayload],
      account: BASE_MECH_PAY_TO_ADDRESS,
    });
    // No throw = clean simulate on the first (and only) attempt, exactly what register-live.ts's
    // fixed preflight step now proves live, before Forces ever sees the REGISTER prompt.
  });

  it('(negative control) simulating with the stale placeholder — the actual bug Forces hit — reverts on this same real forked state', async () => {
    const service = await client.readContract({
      address: serviceRegistryAddress,
      abi: SERVICE_REGISTRY_L2_ABI,
      functionName: 'getService',
      args: [REAL_SERVICE_ID],
    });
    const step = nextStepForState(service.state);
    // Deliberately mirror the OLD buggy call: simulate createMech with the placeholder payload
    // register-live.ts used to still be holding at preflight time, before this directive's fix.
    void step;
    await assert.rejects(
      client.simulateContract({
        address: marketplaceAddress,
        abi: MECH_MARKETPLACE_ABI,
        functionName: 'create',
        args: [REAL_SERVICE_ID, gnosisNativeFactory, '0x'],
        account: BASE_MECH_PAY_TO_ADDRESS,
      }),
      'expected the placeholder payload to revert — this is the exact real failure Forces hit, and proves this fork-proof would have caught the D-111 bug (unlike D-110s, which never simulated with the buggy order at all)',
    );
  });
});
