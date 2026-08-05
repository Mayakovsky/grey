import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHANNEL_IDENTITY_REGISTRY, resolveChannelIdentity } from '../src/deps';

describe('CHANNEL_IDENTITY_REGISTRY — E2-BE Kite entry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers exactly Base and Kite mainnet', () => {
    expect(Object.keys(CHANNEL_IDENTITY_REGISTRY).sort()).toEqual(['eip155:2366', 'eip155:8453']);
  });

  it('Kite resolves to the literal ceremony-generated address, not an env read', () => {
    // Deliberately leave BASE_X402_PAY_TO/X402_NETWORK unset here — if Kite's entry were
    // accidentally wired as env-driven (copy-paste from Base's shape), this would resolve to
    // '' instead of the real literal, and the test would catch it.
    vi.stubEnv('BASE_X402_PAY_TO', undefined);
    vi.stubEnv('X402_NETWORK', undefined);
    const identity = resolveChannelIdentity('eip155:2366');
    expect(identity.payTo).toBe('0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C');
    expect(identity.network).toBe('eip155:2366');
  });

  it('Kite payTo is distinct from Base payTo (copy-paste-wrong-chain guard)', () => {
    vi.stubEnv('BASE_X402_PAY_TO', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    vi.stubEnv('X402_NETWORK', 'eip155:8453');
    const base = resolveChannelIdentity('eip155:8453');
    const kite = resolveChannelIdentity('eip155:2366');
    expect(kite.payTo.toLowerCase()).not.toBe(base.payTo.toLowerCase());
  });

  it("Base's resolution is unchanged — still env-driven, still fails to '' when unset", () => {
    vi.stubEnv('BASE_X402_PAY_TO', undefined);
    vi.stubEnv('X402_NETWORK', undefined);
    const base = resolveChannelIdentity('eip155:8453');
    expect(base.payTo).toBe('');
    expect(base.network).toBe('');
  });

  it('still fails closed for an unregistered network', () => {
    expect(() => resolveChannelIdentity('eip155:1')).toThrow(/no channel-identity registry entry/);
  });
});
