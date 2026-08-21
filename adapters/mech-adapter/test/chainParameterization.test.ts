// BION-DIRECTIVE-104's own required proof — real, live consequence: mechAdapter.ts:709 hardcoded
// Base's gnosisSafeMultisig regardless of chain, caught by a real pre-flight simulateContract
// revert (UnauthorizedMultisig) before broadcast, no funds touched. The audit this directive asked
// for found a second, not-yet-hit gap at mechAdapter.ts:722 (the createMech factory address) with
// the same root cause. Both paths (Base unchanged, Gnosis now correct) proven here, per this
// directive's own "both paths proven, not just the one that was broken" instruction.
import { describe, it, expect, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  MARKETPLACE_ADDRESSES,
  GNOSIS_MARKETPLACE_ADDRESSES,
  SERVICE_REGISTRY_ADDRESSES,
  GNOSIS_SERVICE_REGISTRY_ADDRESSES,
  loadMechIdentity,
} from '../src/config.js';
import { createServiceRegistryClient } from '../src/serviceRegistryClient.js';
import { createMarketplaceClient } from '../src/marketplaceClient.js';
import { createSafeDeliveryClient } from '../src/safeDeliveryClient.js';
import { MechAdapter } from '../src/mechAdapter.js';
import {
  FAKE_PAY_TO,
  FAKE_POOL,
  FAKE_MECH,
  FAKE_AGENT_INSTANCE,
  fakeMarketplaceClient,
  fakeServiceRegistryClient,
  fakeServiceInfo,
} from './_fakes.js';

// A real-shaped test key — only ever used to construct a viem Account object for these read-only
// property/lookup assertions; never signs anything, never touches a real RPC.
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);

describe('ServiceRegistryClient.gnosisSafeMultisig — chain-correct, not Base-hardcoded (BION-DIRECTIVE-104)', () => {
  it('Base (chainId 8453, the default) exposes Base\'s real gnosisSafeMultisig — unchanged', () => {
    const client = createServiceRegistryClient('http://localhost', account, 8453);
    expect(client.gnosisSafeMultisig).toBe(SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig);
    expect(client.gnosisSafeMultisig).toBe('0x22bE6fDcd3e29851B29b512F714C328A00A96B83');
  });

  it('Gnosis (chainId 100) exposes Gnosis\'s real gnosisSafeMultisig — the actual bug fix', () => {
    const client = createServiceRegistryClient('http://localhost', account, 100);
    expect(client.gnosisSafeMultisig).toBe(GNOSIS_SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig);
    expect(client.gnosisSafeMultisig).toBe('0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE');
    // The real, specific regression this fixes: before this fix, deploy() would have used Base's
    // address unconditionally, which is exactly the address the real UnauthorizedMultisig revert
    // named (BION-DIRECTIVE-104 §0).
    expect(client.gnosisSafeMultisig).not.toBe(SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig);
  });
});

describe('MarketplaceClient.getFactoryAddress — chain-correct, not Base-hardcoded (BION-DIRECTIVE-104 audit finding)', () => {
  it('Base (chainId 8453, the default) resolves NATIVE to Base\'s real factory — unchanged', () => {
    const client = createMarketplaceClient('http://localhost', account, 8453);
    expect(client.getFactoryAddress('NATIVE')).toBe(MARKETPLACE_ADDRESSES.factories.NATIVE);
  });

  it('Gnosis (chainId 100) resolves NATIVE to Gnosis\'s real factory — the audit-caught fix', () => {
    const client = createMarketplaceClient('http://localhost', account, 100);
    expect(client.getFactoryAddress('NATIVE')).toBe(GNOSIS_MARKETPLACE_ADDRESSES.factories.NATIVE);
    expect(client.getFactoryAddress('NATIVE')).not.toBe(MARKETPLACE_ADDRESSES.factories.NATIVE);
  });

  it('Gnosis fails closed for a payment type it genuinely has no factory for, rather than a wrong-chain address', () => {
    const client = createMarketplaceClient('http://localhost', account, 100);
    // Real finding (D-97 Task 1): Gnosis has 3 factories (NATIVE/TOKEN/NVM_NATIVE), not Base's 5
    // (NATIVE/USDC_TOKEN/OLAS_TOKEN/NATIVE_NVM/TOKEN_NVM_USDC) — USDC_TOKEN genuinely doesn't
    // exist on Gnosis's real, deployed factory set.
    expect(() => client.getFactoryAddress('USDC_TOKEN')).toThrow(/no "USDC_TOKEN" factory on chain 100/);
  });
});

describe('SafeDeliveryClient.chainId — chain-correct, not Base-hardcoded (BION-DIRECTIVE-115)', () => {
  // Real, live consequence this fixes: the Gnosis adapter's first real delivery attempt
  // (BION-DIRECTIVE-113's self-test request) failed at eth_sendRawTransaction with "invalid chain
  // id for signer: have 8453 want 100" — createSafeDeliveryClient hardcoded viem's `base` chain
  // object for its public/wallet clients regardless of the chainId param, so the raw transaction
  // it signed always embedded chainId 8453, no matter which chain rpcUrl actually pointed at. Same
  // "http://localhost, never actually dialed" pattern the D-104 tests above use — chain.id is set
  // synchronously at client construction, no real RPC call needed to observe it.
  it('Base (chainId 8453, the default) constructs with chain id 8453 — unchanged', () => {
    const client = createSafeDeliveryClient('http://localhost', FAKE_MECH, account);
    expect(client.chainId).toBe(8453);
  });

  it('Gnosis (chainId 100) constructs with chain id 100 — the actual bug fix', () => {
    const client = createSafeDeliveryClient('http://localhost', FAKE_MECH, account, 100);
    expect(client.chainId).toBe(100);
    // The real, specific regression this fixes: before this fix, this would have been 8453
    // regardless — exactly the mismatch the real "invalid chain id for signer: have 8453 want
    // 100" error named.
    expect(client.chainId).not.toBe(8453);
  });
});

describe('loadMechIdentity — checksum normalization (BION-DIRECTIVE-106, caught live in Gnosis staging)', () => {
  // The real, live-caught bug: Desktop's D-105 mail reported this exact real mech address, but not
  // in strict EIP-55 checksum case. requiredAddress()/loadMechIdentity used to pass it straight to
  // viem's readContract, which enforces checksum strictly and threw "Address must match its
  // checksum counterpart" the first time MechAdapter.start() actually called checkMech() on Gnosis.
  const NON_CHECKSUMMED = '0x1a235555E9545F2B4F1A8e929317FFb893C94dDb';
  const CORRECT_CHECKSUM = '0x1A235555e9545f2B4f1a8E929317FFb893c94dDB';

  it('normalizes a shape-valid but wrongly-cased MECH_ADDRESS on a non-Base chain (the fail-closed path)', () => {
    const identity = loadMechIdentity(
      { MECH_ADDRESS: NON_CHECKSUMMED, MECH_MULTISIG_ADDRESS: NON_CHECKSUMMED },
      100,
    );
    expect(identity.mechAddress).toBe(CORRECT_CHECKSUM);
  });

  it('normalizes the same on the Base override path (MECH_ADDRESS env override, chain 8453)', () => {
    const identity = loadMechIdentity({ MECH_ADDRESS: NON_CHECKSUMMED }, 8453);
    expect(identity.mechAddress).toBe(CORRECT_CHECKSUM);
  });
});

describe('MechAdapter end-to-end: deploy/createMech read from the injected clients, not a hardcoded import', () => {
  // Deliberately distinctive, non-real values — if mechAdapter.ts ever regresses to importing the
  // bare Base constants directly again (this exact bug), these assertions fail because the real
  // Base addresses would show up here instead of these fakes.
  const DISTINCT_MULTISIG = '0x6666666666666666666666666666666666666666' as const;
  const DISTINCT_FACTORY = '0x9999999999999999999999999999999999999999' as const;

  it('runDeployStep passes registry.gnosisSafeMultisig as multisigImplementation, whatever that value is', async () => {
    const simulateDeploy = vi.fn(async () => ({ multisig: DISTINCT_MULTISIG }));
    const simulateCreateMech = vi.fn(async () => FAKE_MECH);
    const registryClient = fakeServiceRegistryClient({
      gnosisSafeMultisig: DISTINCT_MULTISIG,
      getService: async () => fakeServiceInfo({ state: 1 }), // PreRegistration
      simulateActivateRegistration: async () => ({ success: true }),
      simulateRegisterAgents: async () => ({ success: true }),
      simulateDeploy,
    });
    const adapter = new MechAdapter({
      config: {
        payToAddress: FAKE_PAY_TO,
        poolWalletAddress: FAKE_POOL,
        rpcUrl: 'https://example.invalid',
        databaseUrl: 'postgres://fake',
        observeOnly: true,
        agentInstanceAddress: FAKE_AGENT_INSTANCE,
      },
      marketplaceClient: fakeMarketplaceClient({ simulateCreateMech }),
      serviceRegistryClient: registryClient,
      logger: { info: () => {}, error: () => {} } as never,
    });
    await adapter.registerAsMech('NATIVE', {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}`,
      mechPayload: `0x${'00'.repeat(32)}`,
      existingServiceId: 99n,
    });
    expect(simulateDeploy).toHaveBeenCalledWith(99n, DISTINCT_MULTISIG, '0x');
  });

  it('runCreateMechStep passes this.client.getFactoryAddress(paymentType) as factory, whatever that value is', async () => {
    const simulateCreateMech = vi.fn(async () => FAKE_MECH);
    const registryClient = fakeServiceRegistryClient({
      getService: async () => fakeServiceInfo({ state: 3 }), // FinishedRegistration -> only createMech left
      simulateDeploy: async () => ({ multisig: '0x5555555555555555555555555555555555555555' }),
    });
    const adapter = new MechAdapter({
      config: {
        payToAddress: FAKE_PAY_TO,
        poolWalletAddress: FAKE_POOL,
        rpcUrl: 'https://example.invalid',
        databaseUrl: 'postgres://fake',
        observeOnly: true,
      },
      marketplaceClient: fakeMarketplaceClient({
        getFactoryAddress: () => DISTINCT_FACTORY,
        simulateCreateMech,
      }),
      serviceRegistryClient: registryClient,
      logger: { info: () => {}, error: () => {} } as never,
    });
    await adapter.registerAsMech('NATIVE', {
      agentId: 1,
      bondWei: 1n,
      configHash: `0x${'00'.repeat(32)}`,
      mechPayload: `0x${'00'.repeat(32)}`,
      existingServiceId: 99n,
    });
    expect(simulateCreateMech).toHaveBeenCalledWith(DISTINCT_FACTORY, 99n, `0x${'00'.repeat(32)}`);
  });
});
