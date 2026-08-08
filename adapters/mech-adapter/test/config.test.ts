import { describe, it, expect } from 'vitest';
import { loadConfig, MARKETPLACE_ADDRESSES } from '../src/config.js';

const BASE_ENV = {
  BASE_MECH_PAY_TO: '0x1111111111111111111111111111111111111111',
  BASE_MECH_POOL_WALLET: '0x2222222222222222222222222222222222222222',
  GREY_DATABASE_URL: 'postgres://fake',
};

describe('mech-adapter config', () => {
  it('loads with all required env present, defaulting RPC + observeOnly', () => {
    const cfg = loadConfig(BASE_ENV);
    expect(cfg.payToAddress).toBe(BASE_ENV.BASE_MECH_PAY_TO);
    expect(cfg.poolWalletAddress).toBe(BASE_ENV.BASE_MECH_POOL_WALLET);
    expect(cfg.rpcUrl).toBe('https://mainnet.base.org');
    expect(cfg.observeOnly).toBe(true);
  });

  it('fails closed when BASE_MECH_PAY_TO is missing', () => {
    const { BASE_MECH_PAY_TO: _drop, ...rest } = BASE_ENV;
    expect(() => loadConfig(rest)).toThrow(/BASE_MECH_PAY_TO/);
  });

  it('fails closed when BASE_MECH_POOL_WALLET is missing', () => {
    const { BASE_MECH_POOL_WALLET: _drop, ...rest } = BASE_ENV;
    expect(() => loadConfig(rest)).toThrow(/BASE_MECH_POOL_WALLET/);
  });

  it('fails closed when GREY_DATABASE_URL is missing', () => {
    const { GREY_DATABASE_URL: _drop, ...rest } = BASE_ENV;
    expect(() => loadConfig(rest)).toThrow(/GREY_DATABASE_URL/);
  });

  it('rejects a malformed address', () => {
    expect(() => loadConfig({ ...BASE_ENV, BASE_MECH_PAY_TO: 'not-an-address' })).toThrow(
      /not a valid 0x-address/,
    );
  });

  it('observeOnly is only false when explicitly set to "false"', () => {
    expect(loadConfig({ ...BASE_ENV, MECH_ADAPTER_OBSERVE_ONLY: 'false' }).observeOnly).toBe(false);
    expect(loadConfig({ ...BASE_ENV, MECH_ADAPTER_OBSERVE_ONLY: 'anything-else' }).observeOnly).toBe(true);
  });

  it('honors a custom RPC URL', () => {
    const cfg = loadConfig({ ...BASE_ENV, BASE_RPC_URL: 'https://example.invalid' });
    expect(cfg.rpcUrl).toBe('https://example.invalid');
  });

  it('carries the five confirmed factory addresses, one per documented payment type', () => {
    expect(Object.keys(MARKETPLACE_ADDRESSES.factories).sort()).toEqual(
      ['NATIVE', 'NATIVE_NVM', 'OLAS_TOKEN', 'TOKEN_NVM_USDC', 'USDC_TOKEN'].sort(),
    );
  });
});
