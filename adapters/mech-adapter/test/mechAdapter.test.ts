import { describe, it, expect, vi } from 'vitest';
import { MechAdapter } from '../src/mechAdapter.js';
import { silentLogger } from '../src/logger.js';
import { fakeMarketplaceClient, FAKE_PAY_TO, FAKE_POOL } from './_fakes.js';
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

  it('registerAsMech is an unimplemented, explicitly-throwing stub (Olas ServiceRegistry gap)', async () => {
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient(),
      logger: silentLogger(),
    });
    await expect(adapter.registerAsMech('NATIVE', 1n)).rejects.toThrow(/ServiceRegistry/);
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
});
