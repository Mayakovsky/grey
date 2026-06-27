import { CADENCE_MS, THRESHOLD_USDC } from './config.js';

/**
 * Pure sweep-decision logic.
 *
 * Sweep iff:
 *  - balance has reached the threshold (>= 200 USDC), OR
 *  - the weekly cadence has elapsed AND there is a non-zero balance to move.
 *
 * @param balance     current USDC balance (6-decimal wei)
 * @param lastSweepAt epoch ms of the last sweep (0 / null if never)
 * @param now         current epoch ms
 */
export function shouldSweep(
  balance: bigint,
  lastSweepAt: number | null,
  now: number,
): boolean {
  if (balance >= THRESHOLD_USDC) return true;
  const last = lastSweepAt ?? 0;
  const cadenceElapsed = now - last >= CADENCE_MS;
  return cadenceElapsed && balance > 0n;
}
