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
