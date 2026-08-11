// Real regression test for a real bug: executeCreateMech used to return the simulated `result`
// instead of decoding the real CreateMech event from the real receipt, and the two genuinely
// diverged on Grey's own live registration (2026-08-11, tx 0xf6fedb21...289a9e) -- MechFactory
// deploys via plain CREATE, whose address depends on the factory's real deployer nonce at
// execution time, which shifted between simulate and broadcast. Fixture data below is the real,
// raw log from that exact transaction (topics/data copied verbatim), not synthesized.
import { describe, it, expect } from 'vitest';
import { decodeCreateMechAddress } from '../src/marketplaceClient.js';

const REAL_TX_HASH = '0xf6fedb2118f54e4b40d7eae769f10810c98fb7ba308a4fe1e9baa226d0289a9e';

// The real CreateMech log from Grey's own live registration -- verbatim topics/data as read off
// Base mainnet. mech=0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8, serviceId=635 (0x27b),
// mechFactory=0x2E008211f34b25A7d7c102403c6C2C3B665a1abe (the NATIVE factory).
const REAL_CREATE_MECH_LOG = {
  data: '0x' as const,
  topics: [
    '0x46e1ca45c09520471c43e2e88eca33bb51803011cfd456933629dcc645ecacd6',
    '0x0000000000000000000000001ecfb7c086bcd483cf49405dada00c3a6294f6a8',
    '0x000000000000000000000000000000000000000000000000000000000000027b',
    '0x0000000000000000000000002e008211f34b25a7d7c102403c6c2c3b665a1abe',
  ] as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`],
};

// A real log from the SAME transaction, but from the factory contract, not the Marketplace --
// present in the receipt alongside the real CreateMech log, must be skipped, not mistaken for it.
const REAL_FACTORY_LOG = {
  data: '0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000106c2f6300379b7c808a3ba8d4dcb5360583232b3fa30f565a76c6e017342865f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000020148a993ea6fa064db2312367e27de79403edf589454c268eb12a3f20c911efa1' as const,
  topics: [
    '0xb1ea35a385d4517ac7b3fb0eac4f62db4f0c5b4cf8b7aef789bbd1db097edb25',
    '0x000000000000000000000000e535d7acdeed905dddcb5443f41980436833ca2b',
    '0x000000000000000000000000e1544bf83b74df935df07467a22db60c7a37054e',
  ] as [`0x${string}`, `0x${string}`, `0x${string}`],
};

describe('decodeCreateMechAddress (BION-DIRECTIVE-35-followup)', () => {
  it('decodes the real mech address from a real CreateMech log', () => {
    const result = decodeCreateMechAddress([REAL_CREATE_MECH_LOG], REAL_TX_HASH);
    expect(result).toBe('0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8');
  });

  it('skips non-CreateMech logs and finds the real one among several', () => {
    const result = decodeCreateMechAddress([REAL_FACTORY_LOG, REAL_CREATE_MECH_LOG], REAL_TX_HASH);
    expect(result).toBe('0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8');
  });

  it('throws a clear, named error when no CreateMech log is present, instead of guessing', () => {
    expect(() => decodeCreateMechAddress([REAL_FACTORY_LOG], REAL_TX_HASH)).toThrow(/no CreateMech event/);
  });

  it('throws on an empty log list', () => {
    expect(() => decodeCreateMechAddress([], REAL_TX_HASH)).toThrow(/no CreateMech event/);
  });
});
