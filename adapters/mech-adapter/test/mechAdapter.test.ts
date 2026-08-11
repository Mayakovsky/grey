import { describe, it, expect, vi } from 'vitest';
import { MechAdapter } from '../src/mechAdapter.js';
import { silentLogger } from '../src/logger.js';
import {
  fakeMarketplaceClient,
  fakeServiceInfo,
  fakeServiceRegistryClient,
  FAKE_AGENT_INSTANCE,
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
  agentInstanceAddress: FAKE_AGENT_INSTANCE,
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
      // 3 calls inside waitForServiceVisible's poll (2 NonExistent + 1 that finally sees
      // PreRegistration) + 1 more real read (BION-DIRECTIVE-33) to decide what's still needed.
      expect(getService).toHaveBeenCalledTimes(4);
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

  function spiedRegistryClient(state: number, serviceOverrides: Partial<ReturnType<typeof fakeServiceInfo>> = {}) {
    const getService = vi.fn(async () => fakeServiceInfo({ state, ...serviceOverrides }));
    const simulateCreate = vi.fn(async () => ({ serviceId: 42n }));
    const simulateActivateRegistration = vi.fn(async () => ({ success: true }));
    const simulateRegisterAgents = vi.fn(async () => ({ success: true }));
    const simulateDeploy = vi.fn(async () => ({ multisig: FAKE_MULTISIG }));
    const registryClient = fakeServiceRegistryClient({
      getService,
      simulateCreate,
      simulateActivateRegistration,
      simulateRegisterAgents,
      simulateDeploy,
    });
    return {
      registryClient,
      getService,
      simulateCreate,
      simulateActivateRegistration,
      simulateRegisterAgents,
      simulateDeploy,
    };
  }

  describe('state-aware resume (BION-DIRECTIVE-33)', () => {
    const RESUME_PARAMS = {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}` as const,
      mechPayload: `0x${'00'.repeat(32)}` as const,
      existingServiceId: 99n,
    };
    const DEPLOYED_MULTISIG = '0x5555555555555555555555555555555555555555' as const;

    it('PreRegistration (1): runs activateRegistration + registerAgents + deploy + createMech', async () => {
      const spies = spiedRegistryClient(1);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMech('NATIVE', RESUME_PARAMS);
      expect(spies.simulateActivateRegistration).toHaveBeenCalledOnce();
      expect(spies.simulateRegisterAgents).toHaveBeenCalledOnce();
      expect(spies.simulateDeploy).toHaveBeenCalledOnce();
      expect(simulateCreateMech).toHaveBeenCalledOnce();
      expect(result.multisig).toBe(FAKE_MULTISIG);
    });

    it('ActiveRegistration (2): skips activateRegistration, runs registerAgents + deploy + createMech', async () => {
      const spies = spiedRegistryClient(2);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      await adapter.registerAsMech('NATIVE', RESUME_PARAMS);
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).toHaveBeenCalledOnce();
      expect(spies.simulateDeploy).toHaveBeenCalledOnce();
      expect(simulateCreateMech).toHaveBeenCalledOnce();
    });

    it('FinishedRegistration (3): skips activateRegistration + registerAgents, runs deploy + createMech', async () => {
      const spies = spiedRegistryClient(3);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      await adapter.registerAsMech('NATIVE', RESUME_PARAMS);
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).toHaveBeenCalledOnce();
      expect(simulateCreateMech).toHaveBeenCalledOnce();
    });

    it('Deployed (4): skips activateRegistration/registerAgents/deploy, runs createMech only, reuses the real existing multisig', async () => {
      const spies = spiedRegistryClient(4, { multisig: DEPLOYED_MULTISIG });
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMech('NATIVE', RESUME_PARAMS);
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
      expect(simulateCreateMech).toHaveBeenCalledOnce();
      // Proves the multisig came from the real getService read, not from a (never-called) deploy —
      // spiedRegistryClient's simulateDeploy would return FAKE_MULTISIG, a different value.
      expect(result.multisig).toBe(DEPLOYED_MULTISIG);
    });

    it.each([
      [0, 'NonExistent'],
      [5, 'TerminatedBonded'],
    ])('state %i (%s) throws a clear, named error rather than attempting anything', async (state) => {
      const spies = spiedRegistryClient(state);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      await expect(adapter.registerAsMech('NATIVE', RESUME_PARAMS)).rejects.toThrow(/cannot resume/);
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
    });
  });

  describe('registerAsMechStep — single-step execution (BION-DIRECTIVE-34)', () => {
    const STEP_PARAMS = {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}` as const,
      mechPayload: `0x${'00'.repeat(32)}` as const,
    };
    const DEPLOYED_MULTISIG = '0x6666666666666666666666666666666666666666' as const;

    it('no existingServiceId: runs create() only, returns step "create"', async () => {
      const spies = spiedRegistryClient(1); // getService irrelevant here — create() never reads it first
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMechStep('NATIVE', STEP_PARAMS);
      expect(spies.simulateCreate).toHaveBeenCalledOnce();
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(simulateCreateMech).not.toHaveBeenCalled();
      expect(result.step).toBe('create');
      expect(result.serviceId).toBe(42n);
      expect(result.stateBefore).toBe(0);
    });

    it('PreRegistration (1): runs activateRegistration only, stops there', async () => {
      const spies = spiedRegistryClient(1);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMechStep('NATIVE', { ...STEP_PARAMS, existingServiceId: 99n });
      expect(spies.simulateActivateRegistration).toHaveBeenCalledOnce();
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
      expect(simulateCreateMech).not.toHaveBeenCalled();
      expect(result).toMatchObject({ step: 'activateRegistration', serviceId: 99n, stateBefore: 1 });
    });

    it('ActiveRegistration (2): runs registerAgents only, stops there', async () => {
      const spies = spiedRegistryClient(2);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMechStep('NATIVE', { ...STEP_PARAMS, existingServiceId: 99n });
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).toHaveBeenCalledOnce();
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
      expect(simulateCreateMech).not.toHaveBeenCalled();
      expect(result).toMatchObject({ step: 'registerAgents', serviceId: 99n, stateBefore: 2 });
    });

    it('FinishedRegistration (3): runs deploy only, stops there, returns the real multisig', async () => {
      const spies = spiedRegistryClient(3);
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMechStep('NATIVE', { ...STEP_PARAMS, existingServiceId: 99n });
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).toHaveBeenCalledOnce();
      expect(simulateCreateMech).not.toHaveBeenCalled();
      expect(result).toMatchObject({ step: 'deploy', serviceId: 99n, stateBefore: 3, multisig: FAKE_MULTISIG });
    });

    it('Deployed (4): runs createMech only, reuses the real existing multisig', async () => {
      const spies = spiedRegistryClient(4, { multisig: DEPLOYED_MULTISIG });
      const simulateCreateMech = vi.fn(async () => FAKE_MECH);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      const result = await adapter.registerAsMechStep('NATIVE', { ...STEP_PARAMS, existingServiceId: 99n });
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
      expect(simulateCreateMech).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        step: 'createMech',
        serviceId: 99n,
        stateBefore: 4,
        multisig: DEPLOYED_MULTISIG,
        mech: FAKE_MECH,
      });
    });

    it.each([
      [0, 'NonExistent'],
      [5, 'TerminatedBonded'],
    ])('state %i (%s) throws a clear, named error rather than attempting anything', async (state) => {
      const spies = spiedRegistryClient(state);
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      await expect(
        adapter.registerAsMechStep('NATIVE', { ...STEP_PARAMS, existingServiceId: 99n }),
      ).rejects.toThrow(/cannot resume/);
      expect(spies.simulateActivateRegistration).not.toHaveBeenCalled();
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
      expect(spies.simulateDeploy).not.toHaveBeenCalled();
    });
  });

  describe('registerAgents uses a distinct agent instance (BION-DIRECTIVE-35)', () => {
    const STEP_PARAMS = {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}` as const,
      mechPayload: `0x${'00'.repeat(32)}` as const,
      existingServiceId: 99n,
    };

    it('throws a clear, named error when config.agentInstanceAddress is missing', async () => {
      const spies = spiedRegistryClient(2); // ActiveRegistration -> next step is registerAgents
      const NO_AGENT_INSTANCE_CONFIG: MechAdapterConfig = { ...CONFIG, agentInstanceAddress: undefined };
      const adapter = new MechAdapter({
        config: NO_AGENT_INSTANCE_CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: spies.registryClient,
        logger: silentLogger(),
      });
      await expect(adapter.registerAsMechStep('NATIVE', STEP_PARAMS)).rejects.toThrow(/agentInstanceAddress/);
      expect(spies.simulateRegisterAgents).not.toHaveBeenCalled();
    });

    it('passes the configured agentInstanceAddress, not payToAddress, as the agent instance', async () => {
      const simulateRegisterAgents = vi.fn(async () => ({ success: true }));
      const registryClient = fakeServiceRegistryClient({
        getService: async () => fakeServiceInfo({ state: 2 }), // ActiveRegistration
        simulateRegisterAgents,
      });
      const adapter = new MechAdapter({
        config: CONFIG, // CONFIG.agentInstanceAddress = FAKE_AGENT_INSTANCE, != FAKE_PAY_TO
        marketplaceClient: fakeMarketplaceClient(),
        serviceRegistryClient: registryClient,
        logger: silentLogger(),
      });
      await adapter.registerAsMechStep('NATIVE', STEP_PARAMS);
      expect(simulateRegisterAgents).toHaveBeenCalledWith(99n, [FAKE_AGENT_INSTANCE], [1], 1n);
    });
  });
});
