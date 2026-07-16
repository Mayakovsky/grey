import type { Address } from 'viem';

type Env = Record<string, string | undefined>;

/**
 * Phase F refuel — settings (F-Q3(a) ratified values as code defaults; env-tunable).
 * Invariant #22: the numeric defaults + slippage + cap live HERE as one literal
 * block — no other refuel amount literals exist anywhere in the package.
 */

/** Refill floor: refuel when relayer ETH drops below this. 0.0005 ETH. */
export const DEFAULT_FLOOR_WEI = 500_000_000_000_000n;
/** Refill target: top the relayer back up to this. 0.002 ETH. */
export const DEFAULT_TARGET_WEI = 2_000_000_000_000_000n;
/** Hard floor: below this AND refuel not succeeding → CRITICAL alert. 0.0002 ETH. */
export const DEFAULT_HARDFLOOR_WEI = 200_000_000_000_000n;
/** Per-tick USDC spend cap: $10 (6-decimal USDC-wei). */
export const DEFAULT_MAX_USDC = 10_000_000n;
/**
 * Max slippage, parts-per-thousand (10 = 1%, ratified F-Q5). Used both for
 * amountOutMinimum derivation AND the quote-vs-spot sanity band.
 */
export const SLIPPAGE_PPT = 10n;
/** Smallest refuel worth executing: $0.10 of USDC (gas-proportionality guard). */
export const MIN_USDC_IN = 100_000n;

export interface RefuelSettings {
  /** Master switch (GREY_REFUEL_ENABLED, default true). false = module fully inert. */
  enabled: boolean;
  floorWei: bigint;
  targetWei: bigint;
  hardFloorWei: bigint;
  maxUsdcPerTick: bigint;
}

function parseBigint(env: Env, key: string, fallback: bigint): bigint {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`grey-sweeper refuel: ${key} must be a non-negative integer (wei), got "${raw}"`);
  }
  return BigInt(raw);
}

function parseEnabled(env: Env, key: string): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return true;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`grey-sweeper refuel: ${key} must be true/false, got "${raw}"`);
}

/**
 * Load refuel settings from env. Fail-closed on malformed values; sane-ordering
 * checks so misconfiguration can't invert the thresholds.
 */
export function loadRefuelSettings(env: Env = process.env): RefuelSettings {
  const settings: RefuelSettings = {
    enabled: parseEnabled(env, 'GREY_REFUEL_ENABLED'),
    floorWei: parseBigint(env, 'GREY_REFUEL_FLOOR_WEI', DEFAULT_FLOOR_WEI),
    targetWei: parseBigint(env, 'GREY_REFUEL_TARGET_WEI', DEFAULT_TARGET_WEI),
    hardFloorWei: parseBigint(env, 'GREY_REFUEL_HARDFLOOR_WEI', DEFAULT_HARDFLOOR_WEI),
    maxUsdcPerTick: parseBigint(env, 'GREY_REFUEL_MAX_USDC', DEFAULT_MAX_USDC),
  };
  if (settings.targetWei <= settings.floorWei) {
    throw new Error('grey-sweeper refuel: GREY_REFUEL_TARGET_WEI must exceed GREY_REFUEL_FLOOR_WEI');
  }
  if (settings.hardFloorWei > settings.floorWei) {
    throw new Error('grey-sweeper refuel: GREY_REFUEL_HARDFLOOR_WEI must not exceed GREY_REFUEL_FLOOR_WEI');
  }
  return settings;
}

/** Outcome statuses — mirror sweep_log's style; persisted to grey_two.refuel_log. */
export type RefuelStatus = 'ok' | 'skipped' | 'insufficient_usdc' | 'quote_oob' | 'failed';

export interface RefuelLogRow {
  chainId: number;
  relayerBalanceBeforeWei: bigint;
  deficitWei: bigint | null;
  usdcIn: bigint | null;
  quoteOutWei: bigint | null;
  minOutWei: bigint | null;
  swapTx: string | null;
  unwrapTx: string | null;
  transferTx: string | null;
  ethDeliveredWei: bigint | null;
  status: RefuelStatus;
  errorClass: string | null;
  /** Redacted per FDQ-43 posture — messages only, never URLs-with-creds or secrets. */
  errorDetail: string | null;
}

export interface RefuelResultOk {
  status: 'ok';
  usdcIn: bigint;
  ethDeliveredWei: bigint;
  swapTx: string;
  unwrapTx: string;
  transferTx: string;
}
export interface RefuelResultOther {
  status: Exclude<RefuelStatus, 'ok'>;
  errorClass?: string;
  errorDetail?: string;
}
export type RefuelResult = RefuelResultOk | RefuelResultOther;

/** Type guard: address helper for the pinned-destination runtime check (invariant #21). */
export function isRelayer(addr: Address, relayer: Address): boolean {
  return addr.toLowerCase() === relayer.toLowerCase();
}
