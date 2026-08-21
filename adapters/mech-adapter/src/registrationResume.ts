// Real fix for BION-DIRECTIVE-103 — a real, live consequence of a real gap: register-live.ts's
// D-101 diff hardcoded `EXISTING_SERVICE_ID = undefined` for any non-Base chain, with no way to
// carry a discovered serviceId across process restarts. Forces' terminal closed between two runs;
// the script forgot serviceId 3789 (real, confirmed create()) and created a second, orphaned
// service (3790) instead of resuming. This module is the decision logic that was missing,
// extracted so it's independently unit-testable (D-103's own "prove both paths... mock/fixture
// this, don't run it for real again" instruction) rather than only provable by re-running the
// real, key-gated script.
//
// Base is UNCHANGED by this: its serviceId (635) was already known and fixed at authoring time,
// same hardcoded literal as before — this module's non-trivial logic only applies when no
// hardcoded default exists for the chain in question.

import { SERVICE_STATE } from './serviceRegistryAbi.js';

export type MechRegistrationStep = 'activateRegistration' | 'registerAgents' | 'deploy' | 'createMech';

/** Real fix for BION-DIRECTIVE-111 — a genuine ordering bug in D-110's own fix, found the first
 *  time Forces actually ran the corrected script for real: `register-live.ts` computed the real
 *  ABI-encoded delivery rate only AFTER calling `MechAdapter.registerAsMechStep` to learn which
 *  step was next — but `registerAsMechStep` doesn't just report the step, it immediately simulates
 *  it too (same call, `mechAdapter.ts:426`), using whatever payload was passed in at that point.
 *  For a `Deployed` service that's `createMech`, so the FIRST (and, since `observeOnly` gates it,
 *  only-simulated) real call ran with the still-placeholder `'0x'` payload, before this script ever
 *  got a chance to correct it. Aborted safely (D-110's own layered defenses caught it), but told
 *  Forces nothing useful about whether the real fix actually worked.
 *
 *  Real fix: the step is fully determined by `state` alone (no simulate needed to know it —
 *  `mechAdapter.ts`'s own `stateBefore === ...` branching already proves this). Extracted here as
 *  the one source of truth so `register-live.ts` can determine `step` itself (via a direct
 *  `getService` read, which it already has the client for), resolve the real payload via
 *  `resolveMechPayload`, and only THEN call `registerAsMechStep` — with the now-correct
 *  `params.mechPayload` — for its actual (still real, still `observeOnly`-gated) preflight
 *  simulate. `mechAdapter.ts`'s own `registerAsMechStep` also uses this function internally now,
 *  so the state→step mapping can't drift into two different implementations. */
export function nextStepForState(state: number): MechRegistrationStep {
  if (state === SERVICE_STATE.PreRegistration) return 'activateRegistration';
  if (state === SERVICE_STATE.ActiveRegistration) return 'registerAgents';
  if (state === SERVICE_STATE.FinishedRegistration) return 'deploy';
  return 'createMech'; // caller is responsible for confirming state is actually Deployed (or NonExistent, handled separately) first
}

export interface GetServiceLike {
  (serviceId: bigint): Promise<{ state: number }>;
}

export interface GetOwnedServiceCountLike {
  (): Promise<bigint>;
}

/** Mirrors serviceRegistryAbi.ts's SERVICE_STATE.NonExistent (0) — duplicated as a literal here
 *  rather than imported, so this module has zero dependency on viem/chain wiring and stays trivial
 *  to unit-test with plain mock functions. */
const NON_EXISTENT_STATE = 0;

export type ResumeDecision =
  | { mode: 'resume'; serviceId: bigint }
  | { mode: 'create' }
  | { mode: 'abort'; reason: string };

export interface ResolveExistingServiceIdParams {
  /** Undefined chain-wide default (e.g. Base's hardcoded 635n) — when set, this ALWAYS wins
   *  unless `serviceIdFlag` explicitly overrides it. Chains with no such default (Gnosis, and any
   *  future chain) pass `undefined` here, which is what makes the rest of this function's real
   *  safety logic engage. */
  hardcodedDefaultServiceId: bigint | undefined;
  /** Parsed from `--service-id <n>` — the operator asserting "I know this service already
   *  exists." */
  serviceIdFlag: bigint | undefined;
  /** `getService(id)` — used to validate an explicitly-passed `--service-id` really exists before
   *  trusting it (BION-DIRECTIVE-103 §1's "fail closed with a clear message if it doesn't resolve,
   *  don't silently fall through to create" instruction). */
  getService: GetServiceLike;
  /** `balanceOf(payToAddress)`-style owned-service count — the real, available belt-and-suspenders
   *  check (BION-DIRECTIVE-103 §1.2). `ServiceRegistryL2` does NOT support `tokenOfOwnerByIndex`
   *  (confirmed live: it reverts) so a specific existing serviceId can't be recovered this way —
   *  only a count, which is still a real, useful signal: if the owner already holds N>=1
   *  services and no `--service-id` was passed, that's exactly the state that produced the real
   *  3789/3790 duplicate, and should abort rather than silently create another one. */
  getOwnedServiceCount: GetOwnedServiceCountLike;
  /** Explicit override for the rare, deliberate "yes, create a genuinely new service even though
   *  I already own some" case — required to bypass the balanceOf-based abort. */
  forceCreateNewService: boolean;
}

export async function resolveExistingServiceId(params: ResolveExistingServiceIdParams): Promise<ResumeDecision> {
  const { hardcodedDefaultServiceId, serviceIdFlag, getService, getOwnedServiceCount, forceCreateNewService } = params;

  // Explicit --service-id always wins when given, on any chain (including Base, where it lets an
  // operator target a different service than the hardcoded default if they ever needed to) — but
  // only after confirming it's real, not NonExistent.
  if (serviceIdFlag !== undefined) {
    const service = await getService(serviceIdFlag);
    if (service.state === NON_EXISTENT_STATE) {
      return {
        mode: 'abort',
        reason:
          `--service-id ${serviceIdFlag} does not resolve to a real service (state: NonExistent) — ` +
          'refusing to proceed. Check the id, or omit --service-id to create a new service (subject ' +
          'to the owned-service-count safety check below).',
      };
    }
    return { mode: 'resume', serviceId: serviceIdFlag };
  }

  // No --service-id given. A hardcoded chain-wide default (Base's 635n) still wins — unchanged
  // behavior for Base.
  if (hardcodedDefaultServiceId !== undefined) {
    return { mode: 'resume', serviceId: hardcodedDefaultServiceId };
  }

  // No default, no explicit flag — this is exactly the state that silently created serviceId 3790.
  // Real safety check: does the owner already hold any service(s) on this chain?
  if (!forceCreateNewService) {
    const count = await getOwnedServiceCount();
    if (count > 0n) {
      return {
        mode: 'abort',
        reason:
          `No --service-id given, but the service owner already holds ${count.toString()} service(s) ` +
          'on this chain (ServiceRegistryL2.balanceOf) — refusing to silently create another one ' +
          '(this is the exact real gap that produced the duplicate serviceId 3790, BION-DIRECTIVE-103). ' +
          'Pass --service-id <n> to resume the real existing service, or --force-create-new-service ' +
          'if you deliberately want a genuinely new one. Note: ServiceRegistryL2 does not support ' +
          'owner-indexed enumeration (tokenOfOwnerByIndex reverts), so this check can only report a ' +
          'count, not which id(s) — check a block explorer for the owner\'s real service id(s) if unsure.',
      };
    }
  }

  return { mode: 'create' };
}

// Real fix for BION-DIRECTIVE-110 — a second real, live consequence: register-live.ts's createMech
// step passed GREY_MECH_PAYLOAD_HASH (the IPFS metadata hash) straight through as the real
// createMech `payload` argument, unencoded. The real contracts (MechFactory/MechMarketplace)
// expect `abi.encode(uint256(deliveryRateWei))` there — a real price, not a hash. This is the exact
// same bug BION-DIRECTIVE-51 hit on Base, worked around there only by registering a second,
// corrected mech (D-53/55) rather than fixing this script — it reproduced for real on Gnosis
// (mech 0x1A235555..., confirmed permanently unpayable via a live maxDeliveryRate() read-back)
// the very first time this script's createMech step actually ran there. Extracted so the encoding
// is independently unit-testable, same reasoning as resolveExistingServiceId above.
import { encodeAbiParameters } from 'viem';

export type MechPayloadDecision =
  | { mode: 'encoded'; payload: `0x${string}` }
  | { mode: 'not-needed'; payload: `0x${string}` }
  | { mode: 'missing-delivery-rate' };

/** `step` is whatever `registerAsMechStep`'s own preflight already resolved as the real next step
 *  — only `createMech` actually consumes the returned payload as a delivery rate; every other step
 *  ignores it, so `deliveryRateWei` being absent is only ever a real problem when `step ===
 *  'createMech'`. Never returns the raw metadata hash for `createMech` — that's the bug this
 *  fixes. */
export function resolveMechPayload(
  step: 'create' | 'activateRegistration' | 'registerAgents' | 'deploy' | 'createMech',
  deliveryRateWei: bigint | undefined,
): MechPayloadDecision {
  if (step !== 'createMech') {
    // Real placeholder, not the metadata hash — no other step reads this field, so its exact
    // value doesn't matter, only that it's never mistakable for a real delivery-rate encoding.
    return { mode: 'not-needed', payload: '0x' };
  }
  if (deliveryRateWei === undefined) {
    return { mode: 'missing-delivery-rate' };
  }
  return { mode: 'encoded', payload: encodeAbiParameters([{ type: 'uint256' }], [deliveryRateWei]) };
}
