// grey-pipeline — resolveTokenName unit tests (M3.5 Phase A, spec §6.2: 4 cases).
// Mocks global fetch: DexScreener (GET search) + on-chain RPC (POST eth_call). Covers
// dexscreener-hit, canonicalization, on-chain-fallback, and the null (both-fail) path.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveTokenName } from '../src/discovery/resolveTokenName';

const ADDR = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';

/** Encode a string as a Solidity ABI dynamic-string eth_call return (offset|length|data). */
function abiString(s: string): string {
  const dataHex = Buffer.from(s, 'utf8').toString('hex');
  const offset = (32).toString(16).padStart(64, '0');
  const length = Buffer.byteLength(s, 'utf8').toString(16).padStart(64, '0');
  const data = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64, '0');
  return '0x' + offset + length + data;
}

const dexHit = (name: string) => ({
  ok: true,
  json: async () => ({ pairs: [{ baseToken: { address: ADDR, name } }] }),
});
const dexEmpty = { ok: true, json: async () => ({ pairs: [] }) };
const rpcReturn = (hex: string) => ({ ok: true, json: async () => ({ result: hex }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTokenName', () => {
  it('returns the DexScreener name on a direct hit (no canonicalization needed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => dexHit('Wonderland') as unknown as Response));
    expect(await resolveTokenName(ADDR)).toBe('Wonderland');
  });

  it('canonicalizes a verbose DexScreener label ("Aave Token" → "Aave")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => dexHit('Aave Token') as unknown as Response));
    expect(await resolveTokenName(ADDR)).toBe('Aave');
  });

  it('falls back to on-chain ERC-20 name() when DexScreener misses, then canonicalizes', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      (url.includes('dexscreener')
        ? dexEmpty
        : rpcReturn(abiString('ChainLink Token'))) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTokenName(ADDR)).toBe('Chainlink');
  });

  it('returns null when both DexScreener and the on-chain fallback yield nothing', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      (url.includes('dexscreener') ? dexEmpty : rpcReturn('0x')) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTokenName(ADDR)).toBeNull();
  });
});
