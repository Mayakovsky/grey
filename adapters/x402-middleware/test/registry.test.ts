import { describe, it, expect } from 'vitest';
import { NETWORK_REGISTRY, isRegisteredNetwork, networkRegistryEntry } from '../src/registry.js';

describe('registry — per-chain network table (E2-A, +Kite E2-BE)', () => {
  it('registers exactly Base mainnet, Base Sepolia, and Kite mainnet', () => {
    expect(Object.keys(NETWORK_REGISTRY).sort()).toEqual([
      'eip155:2366',
      'eip155:8453',
      'eip155:84532',
    ]);
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
    expect(entry.payTo).toBeUndefined(); // Base's payTo stays env-driven, unchanged by E2-BE
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
    expect(entry.payTo).toBeUndefined();
  });

  it('golden values: Kite mainnet entry (E2-BE) — verified live against Kite RPC + docs, not guessed', () => {
    const entry = networkRegistryEntry('eip155:2366');
    expect(entry.chainId).toBe(2366);
    // G4 wrap-check: no managed RPC provider supports Kite mainnet yet, so this stays Kite's
    // own endpoints — but all four regional ones now, not just the single global one.
    expect(entry.defaultRpcFallbackUrl).toEqual([
      'https://rpc.gokite.ai/',
      'https://rpc-virginia.gokite.ai/',
      'https://rpc-tokyo.gokite.ai/',
      'https://rpc-ireland.gokite.ai/',
    ]);
    expect(entry.usdc).toEqual({
      address: '0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e',
      name: 'Bridged USDC (Kite AI)',
      version: '2',
      decimals: 6,
    });
    expect(entry.payTo).toBe('0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C');
  });

  it('Kite payTo is distinct from every Base/ACP address in this registry', () => {
    const kite = networkRegistryEntry('eip155:2366');
    const baseUsdcAddresses = [
      networkRegistryEntry('eip155:8453').usdc.address,
      networkRegistryEntry('eip155:84532').usdc.address,
    ];
    for (const addr of baseUsdcAddresses) {
      expect(kite.payTo?.toLowerCase()).not.toBe(addr.toLowerCase());
    }
  });

  it('isRegisteredNetwork accepts Base mainnet, Base Sepolia, and Kite mainnet', () => {
    expect(isRegisteredNetwork('eip155:8453')).toBe(true);
    expect(isRegisteredNetwork('eip155:84532')).toBe(true);
    expect(isRegisteredNetwork('eip155:2366')).toBe(true);
  });

  it('fails closed for an unregistered network — no silent fallback to Base', () => {
    expect(isRegisteredNetwork('eip155:1')).toBe(false);
    // NOTE (correction, E2-BE): the E2-A version of this test used 'eip155:2317' here, labeled
    // "Kite mainnet chain id" — that number was an unverified placeholder, and it was WRONG.
    // Kite's real mainnet chain id, confirmed live against docs.gokite.ai, is 2366 (now
    // registered above). 2368 is Kite's real TESTNET chain id (also confirmed live) — used here
    // instead as the "well-formed but unregistered" example, since it's real and still
    // deliberately not registered in this phase (no testnet Tier A/B addresses exist).
    expect(isRegisteredNetwork('eip155:2368')).toBe(false);
    expect(() => networkRegistryEntry('eip155:1')).toThrow(/no registry entry/);
    expect(() => networkRegistryEntry('eip155:2368')).toThrow(/no registry entry/);
  });

  it('fails closed for a garbage string, not just a plausible-looking unknown network', () => {
    expect(() => networkRegistryEntry('not-a-network')).toThrow(/no registry entry/);
    expect(() => networkRegistryEntry('')).toThrow(/no registry entry/);
  });
});
