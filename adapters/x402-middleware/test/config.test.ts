import { describe, it, expect } from 'vitest';
import { loadX402Config } from '../src/config.js';
import { RELAYER_PK, PAY_TO } from './_sign.js';

const BASE: Record<string, string> = {
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: PAY_TO,
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: RELAYER_PK,
  X402_MAX_TIMEOUT_SECONDS: '120',
};

describe('loadX402Config — fail-closed', () => {
  it('loads a valid env + selects the per-network USDC', () => {
    const cfg = loadX402Config(BASE);
    expect(cfg.chainId).toBe(84532);
    expect(cfg.payTo).toBe(PAY_TO);
    expect(cfg.usdc.address).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(cfg.maxTimeoutSeconds).toBe(120);
  });

  it('defaults maxTimeoutSeconds to 120 when unset', () => {
    const { X402_MAX_TIMEOUT_SECONDS: _omit, ...rest } = BASE;
    expect(loadX402Config(rest).maxTimeoutSeconds).toBe(120);
  });

  it.each(['X402_NETWORK', 'BASE_X402_PAY_TO', 'BASE_RPC_URL', 'X402_RELAYER_PRIVATE_KEY'])(
    'throws on missing %s',
    (key) => {
      expect(() => loadX402Config({ ...BASE, [key]: '' })).toThrow();
    },
  );

  it('rejects an unsupported network', () => {
    expect(() => loadX402Config({ ...BASE, X402_NETWORK: 'eip155:1' })).toThrow(/X402_NETWORK/);
  });

  it('rejects a non-address payTo', () => {
    expect(() => loadX402Config({ ...BASE, BASE_X402_PAY_TO: 'not-an-address' })).toThrow(/PAY_TO/);
  });

  it('rejects a short/invalid relayer key', () => {
    expect(() => loadX402Config({ ...BASE, X402_RELAYER_PRIVATE_KEY: '0xabc' })).toThrow(/RELAYER/);
  });

  it('accepts a 0x-less relayer key and normalizes it', () => {
    const cfg = loadX402Config({ ...BASE, X402_RELAYER_PRIVATE_KEY: RELAYER_PK.slice(2) });
    expect(cfg.relayerPrivateKey).toBe(RELAYER_PK);
  });

  it('rejects a non-positive timeout', () => {
    expect(() => loadX402Config({ ...BASE, X402_MAX_TIMEOUT_SECONDS: '0' })).toThrow();
    expect(() => loadX402Config({ ...BASE, X402_MAX_TIMEOUT_SECONDS: 'abc' })).toThrow();
  });

  describe('CDP Facilitator Phase 2 — cdp field', () => {
    it('is null when neither CDP env var is set — the primary path never needs it', () => {
      expect(loadX402Config(BASE).cdp).toBeNull();
    });

    it('is populated when both are set', () => {
      const cfg = loadX402Config({
        ...BASE,
        CDP_API_KEY_ID: 'test-key-id',
        CDP_API_KEY_SECRET: 'test-key-secret',
      });
      expect(cfg.cdp).toEqual({ apiKeyId: 'test-key-id', apiKeySecret: 'test-key-secret' });
    });

    it.each(['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'])(
      'throws if only %s is set (both-or-neither)',
      (key) => {
        expect(() => loadX402Config({ ...BASE, [key]: 'only-one-set' })).toThrow(/CDP_API_KEY/);
      },
    );
  });
});
