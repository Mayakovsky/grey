import { describe, it, expect } from 'vitest';
import { NETWORK_REGISTRY, isRegisteredNetwork, networkRegistryEntry } from '../src/registry.js';

describe('registry — per-chain network table (E2-A)', () => {
  it('registers exactly the two Base networks in this phase', () => {
    expect(Object.keys(NETWORK_REGISTRY).sort()).toEqual(['eip155:8453', 'eip155:84532']);
  });

  it('golden values: Base mainnet entry matches the pre-refactor literals byte-for-byte', () => {
    const entry = networkRegistryEntry('eip155:8453');
    expect(entry.chainId).toBe(8453);
    expect(entry.defaultRpcFallbackUrl).toBe('https://mainnet.base.org');
    expect(entry.usdc).toEqual({
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      version: '2',
      decimals: 6,
    });
  });

  it('golden values: Base Sepolia entry matches the pre-refactor literals byte-for-byte', () => {
    const entry = networkRegistryEntry('eip155:84532');
    expect(entry.chainId).toBe(84532);
    expect(entry.defaultRpcFallbackUrl).toBe('https://sepolia.base.org');
    expect(entry.usdc).toEqual({
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      name: 'USDC',
      version: '2',
      decimals: 6,
    });
  });

  it('isRegisteredNetwork accepts both Base networks', () => {
    expect(isRegisteredNetwork('eip155:8453')).toBe(true);
    expect(isRegisteredNetwork('eip155:84532')).toBe(true);
  });

  it('fails closed for an unregistered network — no silent fallback to Base', () => {
    expect(isRegisteredNetwork('eip155:1')).toBe(false);
    expect(isRegisteredNetwork('eip155:2317')).toBe(false); // Kite mainnet chain id — not registered yet
    expect(() => networkRegistryEntry('eip155:1')).toThrow(/no registry entry/);
    expect(() => networkRegistryEntry('eip155:2317')).toThrow(/no registry entry/);
  });

  it('fails closed for a garbage string, not just a plausible-looking unknown network', () => {
    expect(() => networkRegistryEntry('not-a-network')).toThrow(/no registry entry/);
    expect(() => networkRegistryEntry('')).toThrow(/no registry entry/);
  });
});
