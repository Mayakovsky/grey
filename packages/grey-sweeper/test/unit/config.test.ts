import { describe, it, expect } from 'vitest';
import {
  BASE_POOL_WALLET_ADDRESS,
  CADENCE_MS,
  DEFAULT_TICK_MS,
  THRESHOLD_USDC,
  loadConfig,
} from '../../src/config.js';

function baseEnv(): Record<string, string> {
  return {
    GREY_SWEEPER_RPC_URL: 'https://rpc.example',
    GREY_SWEEPER_CHAIN_ID: '8453',
    GREY_AGENT_WALLET_PRIVATE_KEY: '0x' + '1'.repeat(64),
    GREY_USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    GREY_PG_URL: 'postgres://localhost/grey_two',
    GREY_NTFY_OPS_URL: 'https://ntfy.example/ops',
    GREY_NTFY_CRIT_URL: 'https://ntfy.example/crit',
  };
}

describe('constants', () => {
  it('THRESHOLD_USDC is 200 USDC at 6 decimals', () => {
    expect(THRESHOLD_USDC).toBe(200_000_000n);
  });
  it('CADENCE_MS is 7 days', () => {
    expect(CADENCE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it('DEFAULT_TICK_MS is 300000', () => {
    expect(DEFAULT_TICK_MS).toBe(300_000);
  });
});

describe('BASE_POOL_WALLET_ADDRESS — invariant #16 literal', () => {
  it('is the hardcoded test placeholder literal', () => {
    expect(BASE_POOL_WALLET_ADDRESS).toBe('0xdead00000000000000000000000000000000dead');
  });
  it('is a valid 40-hex address', () => {
    expect(BASE_POOL_WALLET_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('loadConfig', () => {
  it('loads when all required env present', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.rpcUrl).toBe('https://rpc.example');
    expect(cfg.chainId).toBe(8453);
    expect(cfg.tickMs).toBe(DEFAULT_TICK_MS);
  });

  it('parses tick override', () => {
    const env = { ...baseEnv(), GREY_SWEEPER_TICK_MS: '60000' };
    expect(loadConfig(env).tickMs).toBe(60_000);
  });

  it('defaults tick to 300000 when unset', () => {
    expect(loadConfig(baseEnv()).tickMs).toBe(300_000);
  });

  it('throws on missing required env', () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>)['GREY_SWEEPER_RPC_URL'];
    expect(() => loadConfig(env)).toThrow(/GREY_SWEEPER_RPC_URL/);
  });

  it('rejects invalid chain id', () => {
    const env = { ...baseEnv(), GREY_SWEEPER_CHAIN_ID: '1' };
    expect(() => loadConfig(env)).toThrow(/CHAIN_ID/);
  });

  it('accepts testnet chain id 84532', () => {
    const env = { ...baseEnv(), GREY_SWEEPER_CHAIN_ID: '84532' };
    expect(loadConfig(env).chainId).toBe(84532);
  });

  it('never sources the destination from env (no env key influences destination)', () => {
    const env = {
      ...baseEnv(),
      BASE_POOL_WALLET_ADDRESS: '0x0000000000000000000000000000000000000bad',
    };
    loadConfig(env);
    expect(BASE_POOL_WALLET_ADDRESS).toBe('0xdead00000000000000000000000000000000dead');
  });
});
