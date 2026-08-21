// Test doubles for the mech adapter — a fake MarketplaceClient, a fake ServiceRegistryClient, and
// a fake SafeDeliveryClient (BION-DIRECTIVE-38), no real RPC, no network calls.
import type { Address, Hash, Hex } from 'viem';
import type { MarketplaceClient } from '../src/marketplaceClient.js';
import type { SafeDeliveryClient, SignedSafeCall, SignedSafeDelivery } from '../src/safeDeliveryClient.js';
import type { ServiceInfo, ServiceRegistryClient } from '../src/serviceRegistryClient.js';

export const FAKE_PAY_TO = '0x1111111111111111111111111111111111111111' as Address;
export const FAKE_POOL = '0x2222222222222222222222222222222222222222' as Address;
export const FAKE_MULTISIG = '0x3333333333333333333333333333333333333333' as Address;
export const FAKE_MECH = '0x4444444444444444444444444444444444444444' as Address;
/** BION-DIRECTIVE-35 — deliberately a different address from FAKE_PAY_TO, matching the real
 *  protocol requirement (operator != agent instance). */
export const FAKE_AGENT_INSTANCE = '0x7777777777777777777777777777777777777777' as Address;
export const FAKE_CONFIG_HASH = `0x${'00'.repeat(32)}` as const;
export const FAKE_TX_HASH = `0x${'ab'.repeat(32)}` as const;

export const FAKE_FACTORY = '0x8888888888888888888888888888888888888888' as Address;

export function fakeMarketplaceClient(overrides: Partial<MarketplaceClient> = {}): MarketplaceClient {
  return {
    getFactoryAddress: (_paymentType) => FAKE_FACTORY,
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

const FAKE_SAFE_TX_HASH = `0x${'cd'.repeat(32)}` as const;
const FAKE_SIGNATURE = `0x${'ef'.repeat(64)}1c` as const;

export function fakeSignedDelivery(overrides: Partial<SignedSafeDelivery> = {}): SignedSafeDelivery {
  return {
    mech: FAKE_MECH,
    multisig: FAKE_MULTISIG,
    data: '0x1234' as Hex,
    nonce: 0n,
    safeTxGas: 100000n,
    safeTxHash: FAKE_SAFE_TX_HASH,
    signature: FAKE_SIGNATURE,
    ...overrides,
  };
}

export function fakeSignedCall(overrides: Partial<SignedSafeCall> = {}): SignedSafeCall {
  return {
    target: FAKE_MECH,
    multisig: FAKE_MULTISIG,
    data: '0x1234' as Hex,
    nonce: 0n,
    safeTxGas: 100000n,
    safeTxHash: FAKE_SAFE_TX_HASH,
    signature: FAKE_SIGNATURE,
    ...overrides,
  };
}

export function fakeSafeDeliveryClient(overrides: Partial<SafeDeliveryClient> = {}): SafeDeliveryClient {
  return {
    chainId: 8453,
    buildSignedDelivery: async (_mech: Address, _requestIds: readonly Hash[], _datas: readonly Hex[]) =>
      fakeSignedDelivery(),
    simulateDelivery: async (_signed: SignedSafeDelivery) => ({ success: true }),
    executeDelivery: async (_signed: SignedSafeDelivery) => ({ success: true, txHash: FAKE_TX_HASH }),
    buildSignedCall: async (_target: Address, _data: Hex) => fakeSignedCall(),
    simulateCall: async (_signed: SignedSafeCall) => ({ success: true }),
    executeCall: async (_signed: SignedSafeCall) => ({ success: true, txHash: FAKE_TX_HASH }),
    ...overrides,
  };
}

export function fakeServiceRegistryClient(overrides: Partial<ServiceRegistryClient> = {}): ServiceRegistryClient {
  return {
    gnosisSafeMultisig: FAKE_MULTISIG,
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
