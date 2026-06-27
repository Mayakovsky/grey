import { describe, it, expect, vi } from 'vitest';
import { appendSweepLog, getLastSweepTimestamp } from '../../src/log.js';
import type { PoolLike, SweepLogRow } from '../../src/log.js';

function mockPool(rows: Array<Record<string, unknown>> = []) {
  const calls: Array<{ text: string; params?: ReadonlyArray<unknown> }> = [];
  const pool: PoolLike = {
    query: vi.fn(async (text: string, params?: ReadonlyArray<unknown>) => {
      calls.push({ text, params });
      return { rows };
    }),
  };
  return { pool, calls };
}

const OK_ROW: SweepLogRow = {
  txHash: '0xabc',
  amountWei: 200_000_000n,
  source: '0xsource',
  destination: '0xdest',
  status: 'ok',
  errorClass: null,
  errorMsg: null,
  chainId: 8453,
};

describe('appendSweepLog', () => {
  it('writes an ok row with tx_hash and amount as string', async () => {
    const { pool, calls } = mockPool();
    await appendSweepLog(pool, OK_ROW);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain('INSERT INTO grey_two.sweep_log');
    const p = calls[0]!.params!;
    expect(p[0]).toBe('0xabc'); // tx_hash
    expect(p[1]).toBe('200000000'); // amount_wei as numeric string
    expect(p[2]).toBe('0xsource');
    expect(p[3]).toBe('0xdest');
    expect(p[4]).toBe('ok');
    expect(p[5]).toBeNull(); // error_class
    expect(p[6]).toBeNull(); // error_msg
    expect(p[7]).toBe(8453); // chain_id
  });

  it('writes a failed row carrying error_class + error_msg', async () => {
    const { pool, calls } = mockPool();
    await appendSweepLog(pool, {
      ...OK_ROW,
      txHash: null,
      status: 'failed',
      errorClass: 'GasLowError',
      errorMsg: 'gas low',
    });
    const p = calls[0]!.params!;
    expect(p[0]).toBeNull();
    expect(p[4]).toBe('failed');
    expect(p[5]).toBe('GasLowError');
    expect(p[6]).toBe('gas low');
  });

  it('writes a skipped row with null amount serialized as null', async () => {
    const { pool, calls } = mockPool();
    await appendSweepLog(pool, {
      ...OK_ROW,
      txHash: null,
      amountWei: null,
      status: 'skipped',
    });
    const p = calls[0]!.params!;
    expect(p[1]).toBeNull();
    expect(p[4]).toBe('skipped');
  });
});

describe('getLastSweepTimestamp', () => {
  it('returns epoch ms for a Date value', async () => {
    const d = new Date('2026-06-01T00:00:00Z');
    const { pool } = mockPool([{ last: d }]);
    expect(await getLastSweepTimestamp(pool)).toBe(d.getTime());
  });

  it('returns null when there has never been a sweep', async () => {
    const { pool } = mockPool([{ last: null }]);
    expect(await getLastSweepTimestamp(pool)).toBeNull();
  });

  it('parses a timestamp string', async () => {
    const { pool } = mockPool([{ last: '2026-06-01T00:00:00Z' }]);
    expect(await getLastSweepTimestamp(pool)).toBe(new Date('2026-06-01T00:00:00Z').getTime());
  });
});
