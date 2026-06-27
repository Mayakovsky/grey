export type SweepStatus = 'ok' | 'failed' | 'skipped';

export interface SweepLogRow {
  txHash: string | null;
  amountWei: bigint | null;
  source: string;
  destination: string;
  status: SweepStatus;
  errorClass: string | null;
  errorMsg: string | null;
  chainId: number;
}

/**
 * Minimal `pg.Pool` surface we depend on — tests inject a mock recording the
 * SQL text + params.
 */
export interface PoolLike {
  query(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const INSERT_SQL = `INSERT INTO grey_two.sweep_log
  (tx_hash, amount_wei, source, destination, status, error_class, error_msg, chain_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

/** Append a row to `grey_two.sweep_log`. `swept_at` defaults to NOW() in-DB. */
export async function appendSweepLog(pool: PoolLike, row: SweepLogRow): Promise<void> {
  await pool.query(INSERT_SQL, [
    row.txHash,
    row.amountWei === null ? null : row.amountWei.toString(),
    row.source,
    row.destination,
    row.status,
    row.errorClass,
    row.errorMsg,
    row.chainId,
  ]);
}

const LAST_SWEEP_SQL = `SELECT MAX(swept_at) AS last FROM grey_two.sweep_log WHERE status = 'ok'`;

/**
 * Read the epoch-ms timestamp of the most recent successful sweep, or null if
 * there has never been one.
 */
export async function getLastSweepTimestamp(pool: PoolLike): Promise<number | null> {
  const { rows } = await pool.query(LAST_SWEEP_SQL);
  const last = rows[0]?.['last'];
  if (last === null || last === undefined) return null;
  if (last instanceof Date) return last.getTime();
  const parsed = new Date(last as string).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
