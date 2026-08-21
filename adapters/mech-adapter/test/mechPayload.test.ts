// BION-DIRECTIVE-110's own required proof — real, live consequence: register-live.ts's createMech
// step passed GREY_MECH_PAYLOAD_HASH (the IPFS metadata hash) straight through as the payload,
// unencoded. The real MechFactory/MechMarketplace contracts decode `payload` as
// `abi.encode(uint256(deliveryRateWei))` — a price, not a hash. This is the exact bug
// BION-DIRECTIVE-51 hit on Base (worked around there only by registering a second mech,
// D-53/55 — never fixed at the source) and reproduced for real on Gnosis (mech
// 0x1A235555..., confirmed permanently unpayable: a live maxDeliveryRate() read-back came back
// byte-for-byte identical to GREY_MECH_PAYLOAD_HASH). Proven here with mocks/pure decoding, not a
// real chain touch, same bar as BION-DIRECTIVE-103's own test file.
import { describe, it, expect } from 'vitest';
import { decodeAbiParameters } from 'viem';
import { resolveMechPayload } from '../src/registrationResume.js';
import { GREY_MECH_PAYLOAD_HASH } from '../src/config.js';

describe('resolveMechPayload (BION-DIRECTIVE-110)', () => {
  it('createMech + a real delivery rate produces a genuinely ABI-encoded uint256, decodable back to the exact real value', () => {
    const REAL_PRICE_WEI = 130_000_000_000_000_000n; // 0.13 xDAI/ETH, Forces' confirmed real price
    const result = resolveMechPayload('createMech', REAL_PRICE_WEI);
    expect(result.mode).toBe('encoded');
    if (result.mode !== 'encoded') return;
    // The real, load-bearing proof: decode the produced payload back and confirm it's exactly the
    // real price, not the metadata hash reinterpreted as a number (the actual bug).
    const [decoded] = decodeAbiParameters([{ type: 'uint256' }], result.payload);
    expect(decoded).toBe(REAL_PRICE_WEI);
    // Never the metadata hash, byte-for-byte, on any path -- the specific historical bug.
    expect(result.payload.toLowerCase()).not.toBe(GREY_MECH_PAYLOAD_HASH.toLowerCase());
  });

  it('createMech + no delivery rate given fails closed, does not fall through to a placeholder', () => {
    const result = resolveMechPayload('createMech', undefined);
    expect(result).toEqual({ mode: 'missing-delivery-rate' });
  });

  it('non-createMech steps never require a delivery rate, and never receive the metadata hash either', () => {
    for (const step of ['create', 'activateRegistration', 'registerAgents', 'deploy'] as const) {
      const result = resolveMechPayload(step, undefined);
      expect(result.mode).toBe('not-needed');
      if (result.mode !== 'not-needed') continue;
      expect(result.payload.toLowerCase()).not.toBe(GREY_MECH_PAYLOAD_HASH.toLowerCase());
    }
  });

  it('the real historical bug, reproduced deliberately to prove the fix actually catches it: passing the metadata hash as if it were a delivery rate does NOT happen through this function', () => {
    // resolveMechPayload has no code path that could ever return GREY_MECH_PAYLOAD_HASH itself as
    // the payload -- confirmed by construction (it only ever returns '0x', 'missing-delivery-rate',
    // or a genuine encodeAbiParameters(['uint256'], [n]) result). This test exists to make that
    // invariant explicit and regression-checked, not just true by accident of the current code.
    const allPossibleOutcomes = [
      resolveMechPayload('createMech', 130_000_000_000_000_000n),
      resolveMechPayload('createMech', undefined),
      resolveMechPayload('deploy', undefined),
    ];
    for (const outcome of allPossibleOutcomes) {
      if ('payload' in outcome) {
        expect(outcome.payload.toLowerCase()).not.toBe(GREY_MECH_PAYLOAD_HASH.toLowerCase());
      }
    }
  });
});
