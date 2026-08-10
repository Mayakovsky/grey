import { describe, it, expect, vi } from 'vitest';
import { MechAdapter } from '../src/mechAdapter.js';
import { silentLogger } from '../src/logger.js';
import {
  fakeMarketplaceClient,
  fakeServiceInfo,
  fakeServiceRegistryClient,
  FAKE_MECH,
  FAKE_MULTISIG,
  FAKE_PAY_TO,
  FAKE_POOL,
  FAKE_TX_HASH,
} from './_fakes.js';
import { MECH_OFFERING_SLUGS, mechPriceUsdFor } from '../src/prices.js';
import type { MechAdapterConfig } from '../src/config.js';

const CONFIG: MechAdapterConfig = {
  payToAddress: FAKE_PAY_TO,
  poolWalletAddress: FAKE_POOL,
  rpcUrl: 'https://example.invalid',
  databaseUrl: 'postgres://fake',
  observeOnly: true,
};

describe('MechAdapter — ChannelIngress contract', () => {
  it('identity() reports the Tier A pay-to address + Grey DID', () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    expect(adapter.identity()).toEqual({ receivingAddress: FAKE_PAY_TO, did: 'did:erc8004:8453:58618' });
  });

  it('registerOffering accumulates the catalog, observable via listOfferings', () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    adapter.registerOffering({ slug: 'prediction_market_research', priceUsd: 0.065 });
    adapter.registerOffering({ slug: 'daily_tech_brief', priceUsd: 5.2 });
    expect(adapter.listOfferings().map((o) => o.slug)).toEqual([
      'prediction_market_research',
      'daily_tech_brief',
    ]);
  });

  it('start() reads marketplace state (read-only) and does not throw when never-registered', async () => {
    const client = fakeMarketplaceClient({
      numMechs: async () => 42n,
      checkMech: async () => '0x0000000000000000000000000000000000000000',
    });
    const adapter = new MechAdapter({ config: CONFIG, marketplaceClient: client, logger: silentLogger() });
    await expect(adapter.start()).resolves.toBeUndefined();
  });

  it('start() throws on a double start (mirrors acp-adapter\'s lifecycle guard)', async () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    await adapter.start();
    await expect(adapter.start()).rejects.toThrow(/already started/);
  });

  it('stop() after start() does not throw', async () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    await adapter.start();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it('registerAsMech throws without an injected serviceRegistryClient (BION-DIRECTIVE-28 guard)', async () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    await expect(
      adapter.registerAsMech('NATIVE', {
        agentId: 1,
        bondWei: 1n,
        configHash: `0x${'00'.repeat(32)}`,
        mechPayload: `0x${'00'.repeat(32)}`,
      }),
    ).rejects.toThrow(/serviceRegistryClient/);
  });

  it('registerAsMech runs the full simulate-only lifecycle when observeOnly (default)', async () => {
    const registryClient = fakeServiceRegistryClient();
    const marketplaceClient = fakeMarketplaceClient();
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient,
      serviceRegistryClient: registryClient,
      logger: silentLogger(),
    });
    const result = await adapter.registerAsMech('NATIVE', {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}`,
      mechPayload: `0x${'00'.repeat(32)}`,
    });
    expect(result).toEqual({
      serviceId: 1n,
      multisig: FAKE_MULTISIG,
      mech: FAKE_MECH,
      simulatedOnly: true,
    });
  });

  it('registerAsMech never calls execute* paths while observeOnly is true', async () => {
    const executeCreate = vi.fn(async () => ({ serviceId: 1n, txHash: `0x${'ab'.repeat(32)}` as const }));
    const executeCreateMech = vi.fn(async () => FAKE_MECH);
    const registryClient = fakeServiceRegistryClient({ executeCreate });
    const marketplaceClient = fakeMarketplaceClient({ executeCreateMech });
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient,
      serviceRegistryClient: registryClient,
      logger: silentLogger(),
    });
    await adapter.registerAsMech('NATIVE', {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}`,
      mechPayload: `0x${'00'.repeat(32)}`,
    });
    expect(executeCreate).not.toHaveBeenCalled();
    expect(executeCreateMech).not.toHaveBeenCalled();
  });

  it('e3-b2: registers all three mech offerings at their 0.65× resolved prices', () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    for (const slug of MECH_OFFERING_SLUGS) {
      adapter.registerOffering({ slug, priceUsd: mechPriceUsdFor(slug) });
    }
    const registered = adapter.listOfferings();
    expect(registered.map((o) => o.slug).sort()).toEqual([...MECH_OFFERING_SLUGS].sort());
    const byPrice = Object.fromEntries(registered.map((o) => [o.slug, o.priceUsd]));
    expect(byPrice.prediction_market_research).toBeCloseTo(0.065, 10);
    expect(byPrice.resolution_evidence_compiler).toBeCloseTo(0.13, 10);
    expect(byPrice.daily_tech_brief).toBeCloseTo(5.2, 10);
  });

  it('start() calls the injected client, not a real network (proves the seam works)', async () => {
    const numMechs = vi.fn(async () => 7n);
    const checkMech = vi.fn(async () => '0x0000000000000000000000000000000000000000' as const);
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient({ numMechs, checkMech }),
      logger: silentLogger(),
    });
    await adapter.start();
    expect(numMechs).toHaveBeenCalledOnce();
    expect(checkMech).toHaveBeenCalledWith(FAKE_PAY_TO);
  });

  describe('waitForServiceVisible (BION-DIRECTIVE-32)', () => {
    const EXECUTE_CONFIG: MechAdapterConfig = { ...CONFIG, observeOnly: false };
    const REAL_PARAMS = {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}` as const,
      mechPayload: `0x${'00'.repeat(32)}` as const,
    };

    it('retries getService until the just-created service becomes visible, then proceeds', async () => {
      const getService = vi
        .fn()
        .mockResolvedValueOnce(fakeServiceInfo({ state: 0 })) // NonExistent — not visible yet
        .mockResolvedValueOnce(fakeServiceInfo({ state: 0 })) // still not visible
        .mockResolvedValue(fakeServiceInfo({ state: 1 })); // now visible (PreRegistration)
      const registryClient = fakeServiceRegistryClient({ getService });
      const adapter = new MechAdapter({
        config: EXECUTE_CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: registryClient,
        serviceVisibilityPoll: { maxAttempts: 5, delayMs: 1 },
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMech('NATIVE', REAL_PARAMS);
      expect(result.simulatedOnly).toBe(false);
      expect(getService).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting attempts, and never calls the real activateRegistration', async () => {
      const getService = vi.fn().mockResolvedValue(fakeServiceInfo({ state: 0 })); // never visible
      const executeActivateRegistration = vi.fn(async () => ({ success: true, txHash: FAKE_TX_HASH }));
      const registryClient = fakeServiceRegistryClient({ getService, executeActivateRegistration });
      const adapter = new MechAdapter({
        config: EXECUTE_CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: registryClient,
        serviceVisibilityPoll: { maxAttempts: 3, delayMs: 1 },
        logger: silentLogger(),
      });
      await expect(adapter.registerAsMech('NATIVE', REAL_PARAMS)).rejects.toThrow(/still not visible/);
      expect(getService).toHaveBeenCalledTimes(3);
      expect(executeActivateRegistration).not.toHaveBeenCalled();
    });
  });
});
