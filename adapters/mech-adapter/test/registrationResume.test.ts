// BION-DIRECTIVE-103's own required proof — "prove both paths... mock/fixture this, don't run it
// for real again to prove it." Real, current serviceId 3789 exists on Gnosis mainnet as of this
// writing; these tests use mocks, not a live RPC call, so they run in the normal vitest gate.
import { describe, it, expect, vi } from 'vitest';
import { resolveExistingServiceId } from '../src/registrationResume.js';

describe('resolveExistingServiceId (BION-DIRECTIVE-103)', () => {
  it('Base: hardcoded default (635n) wins when no --service-id is given, unchanged behavior', async () => {
    const getService = vi.fn();
    const getOwnedServiceCount = vi.fn();
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: 635n,
      serviceIdFlag: undefined,
      getService,
      getOwnedServiceCount,
      forceCreateNewService: false,
    });
    expect(result).toEqual({ mode: 'resume', serviceId: 635n });
    // Neither check should even run when the hardcoded default already resolves this — same
    // "unchanged for Base" bar D-101/103 both held.
    expect(getService).not.toHaveBeenCalled();
    expect(getOwnedServiceCount).not.toHaveBeenCalled();
  });

  it('the real bug this fixes: no default, no --service-id, owner already holds a service -> abort, not create', async () => {
    const getService = vi.fn();
    const getOwnedServiceCount = vi.fn().mockResolvedValue(1n); // real shape: balanceOf(PAY_TO) after serviceId 3789 existed
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: undefined, // Gnosis: no hardcoded default
      serviceIdFlag: undefined, // the exact real gap — terminal restart lost 3789
      getService,
      getOwnedServiceCount,
      forceCreateNewService: false,
    });
    expect(result.mode).toBe('abort');
    if (result.mode === 'abort') {
      expect(result.reason).toContain('1 service(s)');
      expect(result.reason).toContain('--service-id');
    }
    expect(getService).not.toHaveBeenCalled();
  });

  it('no default, no --service-id, owner holds zero services -> create (genuine first-ever run)', async () => {
    const getOwnedServiceCount = vi.fn().mockResolvedValue(0n);
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: undefined,
      serviceIdFlag: undefined,
      getService: vi.fn(),
      getOwnedServiceCount,
      forceCreateNewService: false,
    });
    expect(result).toEqual({ mode: 'create' });
  });

  it('--service-id 3789 resolves to resume when getService confirms it is real (not NonExistent)', async () => {
    const getService = vi.fn().mockResolvedValue({ state: 1 }); // real state: PreRegistration (confirmed live, D-100/103)
    const getOwnedServiceCount = vi.fn();
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: undefined,
      serviceIdFlag: 3789n,
      getService,
      getOwnedServiceCount,
      forceCreateNewService: false,
    });
    expect(result).toEqual({ mode: 'resume', serviceId: 3789n });
    expect(getService).toHaveBeenCalledWith(3789n);
    // Explicit --service-id short-circuits the balanceOf check entirely — it's redundant once a
    // specific id is asserted and confirmed real.
    expect(getOwnedServiceCount).not.toHaveBeenCalled();
  });

  it('--service-id pointing at a NonExistent service fails closed, does not fall through to create', async () => {
    const getService = vi.fn().mockResolvedValue({ state: 0 }); // SERVICE_STATE.NonExistent
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: undefined,
      serviceIdFlag: 999999n,
      getService,
      getOwnedServiceCount: vi.fn(),
      forceCreateNewService: false,
    });
    expect(result.mode).toBe('abort');
    if (result.mode === 'abort') {
      expect(result.reason).toContain('999999');
      expect(result.reason).toContain('NonExistent');
    }
  });

  it('--force-create-new-service bypasses the owned-count abort deliberately', async () => {
    const getOwnedServiceCount = vi.fn().mockResolvedValue(2n); // real shape: after both 3789 AND the orphaned 3790 exist
    const result = await resolveExistingServiceId({
      hardcodedDefaultServiceId: undefined,
      serviceIdFlag: undefined,
      getService: vi.fn(),
      getOwnedServiceCount,
      forceCreateNewService: true,
    });
    expect(result).toEqual({ mode: 'create' });
  });
});
