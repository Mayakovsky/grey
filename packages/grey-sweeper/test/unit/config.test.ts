import { describe, it, expect } from 'vitest';
import {
  BASE_POOL_WALLET_ADDRESS,
  SEPOLIA_TEST_POOL_WALLET_ADDRESS,
  KITE_POOL_WALLET_ADDRESS,
  POOL_WALLET_BY_CHAIN_ID,
  poolWalletFor,
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
    GREY_NTFY_USER: 'grey-sweeper',
    GREY_NTFY_PASS: 's3cr3t-P@ss!42',
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
  it('is the hardcoded canonical Tier-B address literal', () => {
    expect(BASE_POOL_WALLET_ADDRESS).toBe('0x9324525D2Af0B0636F438B1A85f67F89AF821d74');
  });
  it('is a valid 40-hex address', () => {
    expect(BASE_POOL_WALLET_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('POOL_WALLET_BY_CHAIN_ID + poolWalletFor — FDQ-23 (fail-closed)', () => {
  it('maps mainnet 8453 to the canonical Tier-B literal', () => {
    expect(POOL_WALLET_BY_CHAIN_ID[8453]).toBe(BASE_POOL_WALLET_ADDRESS);
    expect(poolWalletFor(8453)).toBe(BASE_POOL_WALLET_ADDRESS);
  });

  it('maps Sepolia 84532 to the test pool literal', () => {
    expect(POOL_WALLET_BY_CHAIN_ID[84532]).toBe(SEPOLIA_TEST_POOL_WALLET_ADDRESS);
    expect(poolWalletFor(84532)).toBe(SEPOLIA_TEST_POOL_WALLET_ADDRESS);
  });

  it('the two Base destinations are distinct (Sepolia never routes to mainnet)', () => {
    expect(SEPOLIA_TEST_POOL_WALLET_ADDRESS.toLowerCase()).not.toBe(
      BASE_POOL_WALLET_ADDRESS.toLowerCase(),
    );
  });

  it('fails closed on an unlisted chainId — throws, never defaults to mainnet', () => {
    expect(() => poolWalletFor(1)).toThrow(/no sweep destination configured for chainId 1/);
    expect(() => poolWalletFor(0)).toThrow(/refusing to sweep/);
  });

  describe('E2-BE — Kite mainnet (2366)', () => {
    it('maps 2366 to KITE_POOL_WALLET_ADDRESS', () => {
      expect(POOL_WALLET_BY_CHAIN_ID[2366]).toBe(KITE_POOL_WALLET_ADDRESS);
      expect(poolWalletFor(2366)).toBe(KITE_POOL_WALLET_ADDRESS);
    });

    it('is a valid 40-hex address', () => {
      expect(KITE_POOL_WALLET_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('is distinct from every Base destination (copy-paste-wrong-chain guard)', () => {
      expect(KITE_POOL_WALLET_ADDRESS.toLowerCase()).not.toBe(BASE_POOL_WALLET_ADDRESS.toLowerCase());
      expect(KITE_POOL_WALLET_ADDRESS.toLowerCase()).not.toBe(
        SEPOLIA_TEST_POOL_WALLET_ADDRESS.toLowerCase(),
      );
    });

    it('no Kite testnet chain id is registered — no fabricated address exists for one', () => {
      expect(() => poolWalletFor(2368)).toThrow(/no sweep destination configured for chainId 2368/);
    });
  });
});

describe('loadConfig', () => {
  it('loads when all required env present', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.rpcUrl).toBe('https://rpc.example');
    expect(cfg.chainId).toBe(8453);
    expect(cfg.tickMs).toBe(DEFAULT_TICK_MS);
  });

  it('loads ntfy Basic-auth creds from separate env vars (FDQ-43)', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.ntfyOpsUrl).toBe('https://ntfy.example/ops');
    expect(cfg.ntfyCritUrl).toBe('https://ntfy.example/crit');
    expect(cfg.ntfyUser).toBe('grey-sweeper');
    expect(cfg.ntfyPass).toBe('s3cr3t-P@ss!42');
  });

  it('the credential-free topic URLs carry no embedded userinfo', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.ntfyOpsUrl).not.toContain('@');
    expect(cfg.ntfyCritUrl).not.toContain('@');
  });

  it('throws when GREY_NTFY_USER is missing', () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>)['GREY_NTFY_USER'];
    expect(() => loadConfig(env)).toThrow(/GREY_NTFY_USER/);
  });

  it('throws when GREY_NTFY_PASS is missing', () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>)['GREY_NTFY_PASS'];
    expect(() => loadConfig(env)).toThrow(/GREY_NTFY_PASS/);
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

  it('accepts Kite mainnet chain id 2366 (E2-BE)', () => {
    const env = { ...baseEnv(), GREY_SWEEPER_CHAIN_ID: '2366' };
    expect(loadConfig(env).chainId).toBe(2366);
  });

  it('never sources the destination from env (no env key influences destination)', () => {
    const env = {
      ...baseEnv(),
      BASE_POOL_WALLET_ADDRESS: '0x0000000000000000000000000000000000000bad',
    };
    loadConfig(env);
    expect(BASE_POOL_WALLET_ADDRESS).toBe('0x9324525D2Af0B0636F438B1A85f67F89AF821d74');
  });
});
