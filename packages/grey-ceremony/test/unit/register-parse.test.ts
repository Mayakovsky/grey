import { describe, it, expect } from 'vitest';
import { keccak256, toBytes, toHex, pad } from 'viem';
import type { Hex, Log } from 'viem';
import { parseRegisteredTokenId } from '../../src/transactions/index.ts';

// Confirmed on-chain topic0 for the deployed ERC-8004 Registered event (FDQ-24).
const REGISTERED_TOPIC0 = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// abi-encoded empty string (offset 0x20, length 0) — the agentURI="" payload.
const EMPTY_STRING_DATA = ('0x' + '00'.repeat(31) + '20' + '00'.repeat(32)) as Hex;

const OWNER = '0xe24Aa7A192E88bdf73cfAdeEDA084dE0572A26F4';

function asLogs(logs: Array<{ topics: Hex[]; data: Hex }>): readonly Log[] {
  return logs as unknown as readonly Log[];
}
const u256 = (n: bigint): Hex => pad(toHex(n), { size: 32 });
const addr32 = (a: string): Hex => pad(a as Hex, { size: 32 });

function registeredLog(tokenId: bigint, owner = OWNER): { topics: Hex[]; data: Hex } {
  return { topics: [REGISTERED_TOPIC0, u256(tokenId), addr32(owner)], data: EMPTY_STRING_DATA };
}
function mintTransferLog(tokenId: bigint, to = OWNER): { topics: Hex[]; data: Hex } {
  // ERC-721 Transfer(from=0x0, to, tokenId) — all three indexed.
  return { topics: [TRANSFER_TOPIC0, u256(0n), addr32(to), u256(tokenId)], data: '0x' };
}
// A metadata event the parser must ignore (from the real receipt, log[2]).
const NOISE_LOG = {
  topics: [
    '0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b',
    u256(7602n),
    '0x2ac6109326e720d1435c0db66f7e35eda7839f52b6f1f5520a60788e132b4e39' as Hex,
  ] as Hex[],
  data: '0x' as Hex,
};

describe('Registered event signature (FDQ-24)', () => {
  it('the confirmed topic0 is keccak256("Registered(uint256,string,address)")', () => {
    expect(keccak256(toBytes('Registered(uint256,string,address)'))).toBe(REGISTERED_TOPIC0);
  });
  it('is NOT the old 2-field signature', () => {
    expect(keccak256(toBytes('Registered(uint256,address)'))).not.toBe(REGISTERED_TOPIC0);
  });
});

describe('parseRegisteredTokenId', () => {
  // The three real logs from the Base Sepolia mint (tx 0x726b4ae6…, tokenId 7602).
  const realReceiptLogs = asLogs([mintTransferLog(7602n), registeredLog(7602n), NOISE_LOG]);

  it('extracts 7602 from the real Sepolia mint receipt (both sources agree)', () => {
    expect(parseRegisteredTokenId(realReceiptLogs)).toBe(7602n);
  });

  it('falls back to the ERC-721 Transfer when the Registered event is absent', () => {
    expect(parseRegisteredTokenId(asLogs([mintTransferLog(4242n), NOISE_LOG]))).toBe(4242n);
  });

  it('uses the Registered event when the Transfer is absent', () => {
    expect(parseRegisteredTokenId(asLogs([registeredLog(4242n), NOISE_LOG]))).toBe(4242n);
  });

  it('throws loudly when the two sources disagree (never silently prefers one)', () => {
    const logs = asLogs([mintTransferLog(2n), registeredLog(1n)]);
    expect(() => parseRegisteredTokenId(logs)).toThrow(/tokenId mismatch/);
  });

  it('ignores an ERC-721 Transfer that is not a mint (from != 0x0)', () => {
    const nonMint = { topics: [TRANSFER_TOPIC0, addr32(OWNER), addr32(OWNER), u256(9n)] as Hex[], data: '0x' as Hex };
    expect(parseRegisteredTokenId(asLogs([nonMint, NOISE_LOG]))).toBeNull();
  });

  it('returns null when neither source is present', () => {
    expect(parseRegisteredTokenId(asLogs([NOISE_LOG]))).toBeNull();
  });
});
