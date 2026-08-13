import { describe, it, expect, vi } from 'vitest';
import { MechAdapter } from '../src/mechAdapter.js';
import { silentLogger } from '../src/logger.js';
import {
  fakeMarketplaceClient,
  fakeSafeDeliveryClient,
  fakeServiceInfo,
  fakeServiceRegistryClient,
  fakeSignedDelivery,
  FAKE_AGENT_INSTANCE,
  FAKE_MECH,
  FAKE_MULTISIG,
  FAKE_PAY_TO,
  FAKE_POOL,
  FAKE_TX_HASH,
} from './_fakes.js';
import { MECH_OFFERING_SLUGS, mechPriceUsdFor } from '../src/prices.js';
import type { MechAdapterConfig } from '../src/config.js';
import { createStubResponsePinner } from '../src/responsePinner.js';

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

  it('e3-b2: registers both real mech offerings at their 0.65× resolved prices (BION-DIRECTIVE-62: daily_tech_brief excluded)', () => {
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
  });

  it('start() calls the injected client, not a real network (proves the seam works)', async () => {
    const numMechs = vi.fn(async () => 7n);
    const adapter = new MechAdapter({
      config: CONFIG,
      marketplaceClient: fakeMarketplaceClient({ numMechs }),
      logger: silentLogger(),
    });
    await adapter.start();
    expect(numMechs).toHaveBeenCalledOnce();
  });

  it('BION-DIRECTIVE-51: start() skips the checkMech diagnostic when config.mechAddress is not set (real bug found live: checkMech(mech) requires an actual factory-created mech address — calling it with payToAddress, an EOA never created via a factory, always reverted UnauthorizedAccount)', async () => {
    const checkMech = vi.fn(async () => '0x0000000000000000000000000000000000000000' as const);
    const adapter = new MechAdapter({
      config: CONFIG, // no mechAddress set
      marketplaceClient: fakeMarketplaceClient({ checkMech }),
      logger: silentLogger(),
    });
    await expect(adapter.start()).resolves.toBeUndefined();
    expect(checkMech).not.toHaveBeenCalled();
  });

  it('BION-DIRECTIVE-51: start() calls checkMech with the real mech address when config.mechAddress is set, not payToAddress', async () => {
    const checkMech = vi.fn(async () => FAKE_MULTISIG);
    const adapter = new MechAdapter({
      config: { ...CONFIG, mechAddress: FAKE_MECH },
      marketplaceClient: fakeMarketplaceClient({ checkMech }),
      logger: silentLogger(),
    });
    await adapter.start();
    expect(checkMech).toHaveBeenCalledWith(FAKE_MECH);
    expect(checkMech).not.toHaveBeenCalledWith(FAKE_PAY_TO);
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

  describe('deliverSigned (BION-DIRECTIVE-38)', () => {
    const REQUEST_IDS = [`0x${'11'.repeat(32)}` as const];
    const DATAS = ['0xdeadbeef' as const];

    it('throws a clear, named error when no safeDeliveryClient is configured', async () => {
      const adapter = new MechAdapter({ config: CONFIG, marketplaceClient: fakeMarketplaceClient(), logger: silentLogger() });
      await expect(adapter.deliverSigned(FAKE_MECH, REQUEST_IDS, DATAS)).rejects.toThrow(/safeDeliveryClient/);
    });

    it('observeOnly=true: builds + simulates, never calls executeDelivery', async () => {
      const buildSignedDelivery = vi.fn(async () => fakeSignedDelivery());
      const simulateDelivery = vi.fn(async () => ({ success: true }));
      const executeDelivery = vi.fn(async () => ({ success: true, txHash: FAKE_TX_HASH }));
      const adapter = new MechAdapter({
        config: CONFIG, // observeOnly: true
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery, simulateDelivery, executeDelivery }),
        logger: silentLogger(),
      });
      const result = await adapter.deliverSigned(FAKE_MECH, REQUEST_IDS, DATAS);
      expect(buildSignedDelivery).toHaveBeenCalledWith(FAKE_MECH, REQUEST_IDS, DATAS);
      expect(simulateDelivery).toHaveBeenCalledTimes(1);
      expect(executeDelivery).not.toHaveBeenCalled();
      expect(result.simulatedOnly).toBe(true);
      expect(result.success).toBe(true);
      expect(result.txHash).toBeUndefined();
    });

    it('observeOnly=false: builds + executes, never calls simulateDelivery', async () => {
      const buildSignedDelivery = vi.fn(async () => fakeSignedDelivery());
      const simulateDelivery = vi.fn(async () => ({ success: true }));
      const executeDelivery = vi.fn(async () => ({ success: true, txHash: FAKE_TX_HASH }));
      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery, simulateDelivery, executeDelivery }),
        logger: silentLogger(),
      });
      const result = await adapter.deliverSigned(FAKE_MECH, REQUEST_IDS, DATAS);
      expect(buildSignedDelivery).toHaveBeenCalledWith(FAKE_MECH, REQUEST_IDS, DATAS);
      expect(executeDelivery).toHaveBeenCalledTimes(1);
      expect(simulateDelivery).not.toHaveBeenCalled();
      expect(result.simulatedOnly).toBe(false);
      expect(result.success).toBe(true);
      expect(result.txHash).toBe(FAKE_TX_HASH);
    });

    it('surfaces a real execution failure (success:false) without throwing', async () => {
      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({
          executeDelivery: async () => ({ success: false, txHash: FAKE_TX_HASH }),
        }),
        logger: silentLogger(),
      });
      const result = await adapter.deliverSigned(FAKE_MECH, REQUEST_IDS, DATAS);
      expect(result.success).toBe(false);
    });
  });

  describe('pollAndRespond (BION-DIRECTIVE-43)', () => {
    const MARKETPLACE: `0x${string}` = '0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020';
    const REQUEST_ID = `0x${'11'.repeat(32)}` as const;
    const REQUEST_DATA = `0x${'22'.repeat(32)}` as const;
    const REQUESTER = '0x3333333333333333333333333333333333333333' as const;

    function fakePublicClient(logs: unknown[]) {
      return { getLogs: async () => logs } as never;
    }

    it('throws a clear, named error when publicClient/handlers/handlerDeps are missing', async () => {
      const adapter = new MechAdapter({ config: CONFIG, marketplaceClient: fakeMarketplaceClient(), logger: silentLogger() });
      await expect(adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 1n, 10n, [])).rejects.toThrow(/publicClient/);
    });

    it('BION-DIRECTIVE-45: throws a clear, named error when responsePinner is missing', async () => {
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        publicClient: fakePublicClient([]),
        handlers: {} as never,
        handlerDeps: {} as never,
        logger: silentLogger(),
      });
      await expect(adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 1n, 10n, [])).rejects.toThrow(/responsePinner/);
    });

    it('detects nothing, routes nothing, delivers nothing — no error', async () => {
      const adapter = new MechAdapter({
        config: CONFIG,
        marketplaceClient: fakeMarketplaceClient(),
        publicClient: fakePublicClient([]),
        handlers: {} as never,
        handlerDeps: {} as never,
        responsePinner: createStubResponsePinner(),
        logger: silentLogger(),
      });
      const result = await adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 1n, 10n, []);
      expect(result).toEqual({ routed: [], routingErrors: [] });
    });

    it('routes a detected request and delivers it via deliverSigned, in one signed call', async () => {
      const buildSignedDelivery = vi.fn(async () => fakeSignedDelivery());
      const executeDelivery = vi.fn(async () => ({ success: true, txHash: FAKE_TX_HASH }));
      const handler = vi.fn(async () => ({ payload: { answer: 'yes' }, subject: {} as never, cacheHit: true }));

      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery, executeDelivery }),
        publicClient: fakePublicClient([
          {
            args: {
              priorityMech: FAKE_MECH,
              requester: REQUESTER,
              numRequests: 1n,
              requestIds: [REQUEST_ID],
              requestDatas: [REQUEST_DATA],
            },
            blockNumber: 100n,
            transactionHash: `0x${'44'.repeat(32)}`,
          },
        ]),
        handlers: { prediction_market_research: handler } as never,
        handlerDeps: {} as never,
        responsePinner: createStubResponsePinner(),
        logger: silentLogger(),
      });

      // requestContent fetch isn't injectable through MechAdapter's public surface (production
      // uses the real gateway) — route via a stubbed global fetch for this unit test instead of
      // hitting the network. Real network fetching is covered by requestContent.test.ts /
      // the anvil fork test.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ prompt: 'q', tool: 'prediction_market_research', nonce: 'n', schema_version: '2.0', request_context: null }))) as typeof fetch;
      try {
        const result = await adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 90n, 110n, ['prediction_market_research'] as never);
        expect(result.routingErrors).toEqual([]);
        expect(result.routed).toHaveLength(1);
        expect(result.routed[0].slug).toBe('prediction_market_research');
        expect(result.delivery?.success).toBe(true);
        expect(buildSignedDelivery).toHaveBeenCalledWith(FAKE_MECH, [REQUEST_ID], [result.routed[0].responseHash]);
        expect(executeDelivery).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('BION-DIRECTIVE-58: threads requestContentGatewayUrl through to the request-content fetch', async () => {
      const handler = vi.fn(async () => ({ payload: { answer: 'yes' }, subject: {} as never, cacheHit: true }));
      const OVERRIDE_GATEWAY = 'https://ipfs.io';

      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery: vi.fn(async () => fakeSignedDelivery()) }),
        publicClient: fakePublicClient([
          {
            args: { priorityMech: FAKE_MECH, requester: REQUESTER, numRequests: 1n, requestIds: [REQUEST_ID], requestDatas: [REQUEST_DATA] },
            blockNumber: 100n,
            transactionHash: `0x${'44'.repeat(32)}`,
          },
        ]),
        handlers: { prediction_market_research: handler } as never,
        handlerDeps: {} as never,
        responsePinner: createStubResponsePinner(),
        requestContentGatewayUrl: OVERRIDE_GATEWAY,
        logger: silentLogger(),
      });

      const fetchedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL) => {
        fetchedUrls.push(String(url));
        return new Response(JSON.stringify({ prompt: 'q', tool: 'prediction_market_research', nonce: 'n', schema_version: '2.0', request_context: null }));
      }) as typeof fetch;
      try {
        const result = await adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 90n, 110n, ['prediction_market_research'] as never);
        expect(result.routingErrors).toEqual([]);
        expect(result.routed).toHaveLength(1);
        expect(fetchedUrls).toHaveLength(1);
        expect(fetchedUrls[0].startsWith(OVERRIDE_GATEWAY)).toBe(true);
        expect(fetchedUrls[0].includes('gateway.autonolas.tech')).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('BION-DIRECTIVE-58: falls back to the real default gateway when requestContentGatewayUrl is unset', async () => {
      const handler = vi.fn(async () => ({ payload: { answer: 'yes' }, subject: {} as never, cacheHit: true }));

      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery: vi.fn(async () => fakeSignedDelivery()) }),
        publicClient: fakePublicClient([
          {
            args: { priorityMech: FAKE_MECH, requester: REQUESTER, numRequests: 1n, requestIds: [REQUEST_ID], requestDatas: [REQUEST_DATA] },
            blockNumber: 100n,
            transactionHash: `0x${'44'.repeat(32)}`,
          },
        ]),
        handlers: { prediction_market_research: handler } as never,
        handlerDeps: {} as never,
        responsePinner: createStubResponsePinner(),
        // requestContentGatewayUrl deliberately omitted.
        logger: silentLogger(),
      });

      const fetchedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL) => {
        fetchedUrls.push(String(url));
        return new Response(JSON.stringify({ prompt: 'q', tool: 'prediction_market_research', nonce: 'n', schema_version: '2.0', request_context: null }));
      }) as typeof fetch;
      try {
        const result = await adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 90n, 110n, ['prediction_market_research'] as never);
        expect(result.routingErrors).toEqual([]);
        expect(fetchedUrls).toHaveLength(1);
        expect(fetchedUrls[0].startsWith('https://gateway.autonolas.tech')).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('isolates a routing failure — one bad request does not block the rest, and nothing delivers if all fail', async () => {
      const buildSignedDelivery = vi.fn();
      const adapter = new MechAdapter({
        config: { ...CONFIG, observeOnly: false },
        marketplaceClient: fakeMarketplaceClient(),
        safeDeliveryClient: fakeSafeDeliveryClient({ buildSignedDelivery }),
        publicClient: fakePublicClient([
          {
            args: { priorityMech: FAKE_MECH, requester: REQUESTER, numRequests: 1n, requestIds: [REQUEST_ID], requestDatas: [REQUEST_DATA] },
            blockNumber: 100n,
            transactionHash: `0x${'44'.repeat(32)}`,
          },
        ]),
        handlers: {} as never, // no registered handlers -> UnknownToolError for any tool
        handlerDeps: {} as never,
        responsePinner: createStubResponsePinner(),
        logger: silentLogger(),
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ prompt: 'q', tool: 'not_a_real_tool', nonce: 'n', schema_version: '2.0', request_context: null }))) as typeof fetch;
      try {
        const result = await adapter.pollAndRespond(FAKE_MECH, MARKETPLACE, 90n, 110n, ['prediction_market_research'] as never);
        expect(result.routed).toEqual([]);
        expect(result.routingErrors).toHaveLength(1);
        expect(result.routingErrors[0].requestId).toBe(REQUEST_ID);
        expect(result.delivery).toBeUndefined();
        expect(buildSignedDelivery).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
