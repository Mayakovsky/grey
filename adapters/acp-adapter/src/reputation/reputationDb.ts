// grey_two reputation data layer — raw SQL against grey_two.{buyer_records,tracked_jobs} over a
// pg.Pool surface. Mirrors grey-sweeper/log.ts's PoolLike + parameterized-SQL idiom (the existing
// grey_two writer). Ported from plugin-wpv's DrizzleBuyerStore + WpvTrackedJobsRepo (drizzle →
// raw SQL; table refs `autognostic.wpv_*` → `grey_two.*`).
//
// FDQ-65 GRANT COMPLIANCE: grey_pipeline_rw holds SELECT / INSERT / UPDATE on these tables and
// DELETE/TRUNCATE are REVOKED. EVERY statement below is one of SELECT / INSERT / UPDATE — never a
// DELETE or TRUNCATE. Status transitions use INSERT … ON CONFLICT DO UPDATE (an UPDATE), never a
// delete-and-reinsert. Keep it that way: a stray destructive verb would error at the grant.

/** Minimal `pg.Pool` surface — tests inject a mock recording SQL text + params. */
export interface PoolLike {
  query(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export type BuyerStatus = 'clean' | 'warned' | 'timeout_1h' | 'timeout_12h' | 'blocked';

/** The buyer-reputation projection the gate consumes (subset of grey_two.buyer_records columns). */
export interface BuyerRecord {
  walletAddress: string;
  status: BuyerStatus;
  strikes: number;
  timeoutUntil: Date | null;
  lastStiffAt: Date | null;
  crossProviderCompletesTotal: number;
  crossProviderCreatesTotal: number;
  crossProviderDataCachedAt: Date | null;
}

/** Persisted stiff-transition write (state-machine output). */
export interface StiffWrite {
  status: BuyerStatus;
  strikes: number;
  timeoutUntil: Date | null;
  lastStiffAt: Date;
}

/** Persisted cross-provider tally cache. */
export interface CrossProviderWrite {
  completesTotal: number;
  createsTotal: number;
  cachedAt: Date;
}

export type TrackedTerminalStatus = 'completed' | 'rejected' | 'expired';

export interface TrackSubmittedInput {
  chainId: number;
  jobId: string;
  buyerAddress: string;
  providerOffering: string;
  submittedAt: Date;
  expiresAt: Date;
}

/**
 * Buyer-record persistence surface — an interface so the gate's unit tests inject an in-memory
 * store without a live DB. Production uses PgBuyerRecordStore (raw SQL). Every method maps to a
 * SELECT / INSERT / INSERT…ON CONFLICT DO UPDATE — no destructive verbs.
 */
export interface BuyerRecordStore {
  get(walletLowercased: string): Promise<BuyerRecord | null>;
  insertStubIfAbsent(walletLowercased: string): Promise<void>;
  writeStiff(walletLowercased: string, w: StiffWrite): Promise<void>;
  writeCrossProvider(walletLowercased: string, w: CrossProviderWrite): Promise<void>;
}

/** Tracked-job persistence surface (composite key chain_id+job_id at every site — multi-chain-safe). */
export interface TrackedJobsRepo {
  trackSubmitted(input: TrackSubmittedInput): Promise<void>;
  /** Transition ONLY a still-`submitted` row (the WHERE guard makes this idempotent against the
   *  socket+poll race — the second observer's UPDATE matches zero rows). Returns the resolved row's
   *  buyer for the FIRST observer, or null (already resolved / never tracked). */
  resolveIfSubmitted(
    chainId: number,
    jobId: string,
    terminal: TrackedTerminalStatus,
  ): Promise<{ buyerAddress: string } | null>;
}

// ── row mapping ───────────────────────────────
function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function rowToBuyer(r: Record<string, unknown>): BuyerRecord {
  return {
    walletAddress: String(r['wallet_address'] ?? ''),
    status: (String(r['status'] ?? 'clean') as BuyerStatus),
    strikes: toInt(r['strikes']),
    timeoutUntil: toDate(r['timeout_until']),
    lastStiffAt: toDate(r['last_stiff_at']),
    crossProviderCompletesTotal: toInt(r['cross_provider_completes_total']),
    crossProviderCreatesTotal: toInt(r['cross_provider_creates_total']),
    crossProviderDataCachedAt: toDate(r['cross_provider_data_cached_at']),
  };
}

// ── SQL (all SELECT / INSERT / UPDATE — see FDQ-65 note above) ──
const SELECT_BUYER = `SELECT wallet_address, status, strikes, timeout_until, last_stiff_at,
  cross_provider_completes_total, cross_provider_creates_total, cross_provider_data_cached_at
  FROM grey_two.buyer_records WHERE wallet_address = $1`;

const INSERT_STUB = `INSERT INTO grey_two.buyer_records (wallet_address, status, strikes)
  VALUES ($1, 'clean', 0) ON CONFLICT (wallet_address) DO NOTHING`;

const UPSERT_STIFF = `INSERT INTO grey_two.buyer_records
    (wallet_address, status, strikes, timeout_until, last_stiff_at)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (wallet_address) DO UPDATE SET
    status = $2, strikes = $3, timeout_until = $4, last_stiff_at = $5, updated_at = now()`;

const UPSERT_CROSS = `INSERT INTO grey_two.buyer_records
    (wallet_address, cross_provider_completes_total, cross_provider_creates_total, cross_provider_data_cached_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (wallet_address) DO UPDATE SET
    cross_provider_completes_total = $2, cross_provider_creates_total = $3,
    cross_provider_data_cached_at = $4, updated_at = now()`;

const INSERT_TRACKED = `INSERT INTO grey_two.tracked_jobs
    (chain_id, job_id, buyer_address, provider_offering, submitted_at, expires_at, status)
  VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
  ON CONFLICT (chain_id, job_id) DO NOTHING`;

const RESOLVE_TRACKED = `UPDATE grey_two.tracked_jobs SET status = $3, resolved_at = now()
  WHERE chain_id = $1 AND job_id = $2 AND status = 'submitted'
  RETURNING buyer_address`;

/** Production buyer-record store — raw parameterized SQL over a pg.Pool. */
export class PgBuyerRecordStore implements BuyerRecordStore {
  constructor(private readonly pool: PoolLike) {}
  async get(wallet: string): Promise<BuyerRecord | null> {
    const { rows } = await this.pool.query(SELECT_BUYER, [wallet]);
    return rows[0] ? rowToBuyer(rows[0]) : null;
  }
  async insertStubIfAbsent(wallet: string): Promise<void> {
    await this.pool.query(INSERT_STUB, [wallet]);
  }
  async writeStiff(wallet: string, w: StiffWrite): Promise<void> {
    await this.pool.query(UPSERT_STIFF, [wallet, w.status, w.strikes, w.timeoutUntil, w.lastStiffAt]);
  }
  async writeCrossProvider(wallet: string, w: CrossProviderWrite): Promise<void> {
    await this.pool.query(UPSERT_CROSS, [wallet, w.completesTotal, w.createsTotal, w.cachedAt]);
  }
}

/** Production tracked-jobs repo — raw parameterized SQL over a pg.Pool. */
export class PgTrackedJobsRepo implements TrackedJobsRepo {
  constructor(private readonly pool: PoolLike) {}
  async trackSubmitted(i: TrackSubmittedInput): Promise<void> {
    await this.pool.query(INSERT_TRACKED, [
      i.chainId,
      i.jobId,
      i.buyerAddress,
      i.providerOffering,
      i.submittedAt,
      i.expiresAt,
    ]);
  }
  async resolveIfSubmitted(
    chainId: number,
    jobId: string,
    terminal: TrackedTerminalStatus,
  ): Promise<{ buyerAddress: string } | null> {
    const { rows } = await this.pool.query(RESOLVE_TRACKED, [chainId, jobId, terminal]);
    const r = rows[0];
    return r ? { buyerAddress: String(r['buyer_address'] ?? '') } : null;
  }
}

/**
 * Strip `sslmode`/`ssl` URL params so the pg.Pool `ssl` object (rejectUnauthorized:false — the
 * documented Supabase transaction-pooler posture, matching grey-core's postgres-js connection and
 * grey-sweeper) cannot be overridden by the connection string. Mirrors grey-sweeper/main.ts.
 */
export function stripSslParams(pgUrl: string): string {
  try {
    const u = new URL(pgUrl);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    return u.toString();
  } catch {
    return pgUrl;
  }
}
