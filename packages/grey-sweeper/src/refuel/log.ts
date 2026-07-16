import type { PoolLike } from '../log.js';
import type { RefuelLogRow } from './settings.js';

/**
 * grey_two.refuel_log audit writes (spec §2). Mirrors log.ts's sweep_log module:
 * minimal PoolLike surface, ticked_at defaults to NOW() in-DB.
 */
const INSERT_SQL = `INSERT INTO grey_two.refuel_log
  (chain_id, relayer_balance_before_wei, deficit_wei, usdc_in, quote_out_wei, min_out_wei,
   swap_tx, unwrap_tx, transfer_tx, eth_delivered_wei, status, error_class, error_detail_redacted)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

export async function appendRefuelLog(pool: PoolLike, row: RefuelLogRow): Promise<void> {
  await pool.query(INSERT_SQL, [
    row.chainId,
    row.relayerBalanceBeforeWei.toString(),
    row.deficitWei === null ? null : row.deficitWei.toString(),
    row.usdcIn === null ? null : row.usdcIn.toString(),
    row.quoteOutWei === null ? null : row.quoteOutWei.toString(),
    row.minOutWei === null ? null : row.minOutWei.toString(),
    row.swapTx,
    row.unwrapTx,
    row.transferTx,
    row.ethDeliveredWei === null ? null : row.ethDeliveredWei.toString(),
    row.status,
    row.errorClass,
    row.errorDetail,
  ]);
}
