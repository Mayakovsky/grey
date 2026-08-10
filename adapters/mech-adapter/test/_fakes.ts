// Test doubles for the mech adapter — a fake MarketplaceClient and a fake ServiceRegistryClient,
// no real RPC, no network calls.
import type { Address } from 'viem';
import type { MarketplaceClient } from '../src/marketplaceClient.js';
import type { ServiceInfo, ServiceRegistryClient } from '../src/serviceRegistryClient.js';

export const FAKE_PAY_TO = '0x1111111111111111111111111111111111111111' as Address;
export const FAKE_POOL = '0x2222222222222222222222222222222222222222' as Address;
export const FAKE_MULTISIG = '0x3333333333333333333333333333333333333333' as Address;
export const FAKE_MECH = '0x4444444444444444444444444444444444444444' as Address;
export const FAKE_CONFIG_HASH = `0x${'00'.repeat(32)}` as const;
export const FAKE_TX_HASH = `0x${'ab'.repeat(32)}` as const;

export function fakeMarketplaceClient(overrides: Partial<MarketplaceClient> = {}): MarketplaceClient {
  return {
    numMechs: async () => 0n,
    checkMech: async (_mech: Address) => '0x0000000000000000000000000000000000000000' as Address,
    getRequestStatus: async (_id) => 0,
    simulateCreateMech: async (_factory, _serviceId, _payload) => FAKE_MECH,
    executeCreateMech: async (_factory, _serviceId, _payload) => FAKE_MECH,
    ...overrides,
  };
}

export function fakeServiceInfo(overrides: Partial<ServiceInfo> = {}): ServiceInfo {
  return {
    securityDeposit: 1n,
    multisig: FAKE_MULTISIG,
    configHash: FAKE_CONFIG_HASH,
    threshold: 1,
    maxNumAgentInstances: 1,
    numAgentInstances: 1,
    state: 1, // PreRegistration — a realistic default; a fresh/typical service isn't NonExistent
    agentIds: [],
    ...overrides,
  };
}

export function fakeServiceRegistryClient(overrides: Partial<ServiceRegistryClient> = {}): ServiceRegistryClient {
  return {
    getService: async (_serviceId) => fakeServiceInfo(),
    simulateCreate: async (_params) => ({ serviceId: 1n }),
    executeCreate: async (_params) => ({ serviceId: 1n, txHash: FAKE_TX_HASH }),
    simulateActivateRegistration: async (_serviceId, _valueWei) => ({ success: true }),
    executeActivateRegistration: async (_serviceId, _valueWei) => ({ success: true, txHash: FAKE_TX_HASH }),
    simulateRegisterAgents: async (_serviceId, _agentInstances, _agentIds, _valueWei) => ({ success: true }),
    executeRegisterAgents: async (_serviceId, _agentInstances, _agentIds, _valueWei) => ({
      success: true,
      txHash: FAKE_TX_HASH,
    }),
    simulateDeploy: async (_serviceId, _multisigImplementation, _data) => ({ multisig: FAKE_MULTISIG }),
    executeDeploy: async (_serviceId, _multisigImplementation, _data) => ({
      multisig: FAKE_MULTISIG,
      txHash: FAKE_TX_HASH,
    }),
    ...overrides,
  };
}
