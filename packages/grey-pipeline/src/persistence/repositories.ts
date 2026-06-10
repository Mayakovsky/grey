// grey-pipeline — repositories for the grey_two schema.
// Ported from plugin-wpv/src/db/wpv{Whitepapers,Claims,Verifications}Repo.ts.
// The ONLY changes vs plugin-wpv: table/row imports repointed to ./schema (grey_two),
// and the db param typed as the real Drizzle client (GreyDb) instead of DrizzleDbLike.
// Repository logic is unchanged (bug-preservation). RequestsRepo + CostEventsRepo are
// new-architecture additions (request audit trail + cost telemetry) per the audit.

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { whitepapers, claims, verifications, requests, costEvents } from './schema';
import type {
  WhitepaperRow,
  WhitepaperInsert,
  ClaimRow,
  ClaimInsert,
  VerificationRow,
  VerificationInsert,
  RequestRow,
  RequestInsert,
  CostEventRow,
  CostEventInsert,
} from './schema';
import type { GreyDb } from './client';

/**
 * Normalize token_address to lowercase at the repo boundary (ported verbatim).
 * Only lowercases 0x-prefixed (EVM) addresses; base58 (Solana) stays case-exact.
 */
function normalizeTokenAddress(addr: string | null | undefined): string | null | undefined {
  if (addr == null) return addr;
  if (typeof addr !== 'string') return addr;
  return addr.startsWith('0x') ? addr.toLowerCase() : addr;
}

export class WhitepapersRepo {
  constructor(private db: GreyDb) {}

  async deleteById(id: string): Promise<void> {
    await this.db.delete(whitepapers).where(eq(whitepapers.id, id));
  }

  async create(data: WhitepaperInsert): Promise<WhitepaperRow> {
    const normalized: WhitepaperInsert = {
      ...data,
      tokenAddress: normalizeTokenAddress(data.tokenAddress) as typeof data.tokenAddress,
    };
    const rows = await this.db.insert(whitepapers).values(normalized).returning();
    return rows[0];
  }

  async findById(id: string): Promise<WhitepaperRow | null> {
    const rows: WhitepaperRow[] = await this.db
      .select()
      .from(whitepapers)
      .where(eq(whitepapers.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByProjectName(projectName: string): Promise<WhitepaperRow[]> {
    return this.db
      .select()
      .from(whitepapers)
      .where(sql`LOWER(${whitepapers.projectName}) = LOWER(${projectName})`);
  }

  async findByTokenAddress(tokenAddress: string): Promise<WhitepaperRow[]> {
    const looksEvm = typeof tokenAddress === 'string' && tokenAddress.startsWith('0x');
    if (looksEvm) {
      return this.db
        .select()
        .from(whitepapers)
        .where(sql`LOWER(${whitepapers.tokenAddress}) = LOWER(${tokenAddress})`);
    }
    return this.db.select().from(whitepapers).where(eq(whitepapers.tokenAddress, tokenAddress));
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.db.update(whitepapers).set({ status }).where(eq(whitepapers.id, id));
  }

  async listByStatus(status: string): Promise<WhitepaperRow[]> {
    return this.db.select().from(whitepapers).where(eq(whitepapers.status, status));
  }

  async updateKnowledgeItemId(id: string, knowledgeItemId: string): Promise<void> {
    await this.db.update(whitepapers).set({ knowledgeItemId }).where(eq(whitepapers.id, id));
  }

  async listRecent(limit: number): Promise<WhitepaperRow[]> {
    return this.db.select().from(whitepapers).orderBy(desc(whitepapers.ingestedAt)).limit(limit);
  }

  async findByProjectAndChain(projectName: string, chain: string): Promise<WhitepaperRow | null> {
    const rows: WhitepaperRow[] = await this.db
      .select()
      .from(whitepapers)
      .where(and(eq(whitepapers.projectName, projectName), eq(whitepapers.chain, chain)))
      .limit(1);
    return rows[0] ?? null;
  }
}

export class ClaimsRepo {
  constructor(private db: GreyDb) {}

  async create(data: ClaimInsert): Promise<ClaimRow> {
    const rows = await this.db.insert(claims).values(data).returning();
    return rows[0];
  }

  async findByWhitepaperId(whitepaperId: string): Promise<ClaimRow[]> {
    return this.db.select().from(claims).where(eq(claims.whitepaperId, whitepaperId));
  }

  async deleteByWhitepaperId(whitepaperId: string): Promise<void> {
    await this.db.delete(claims).where(eq(claims.whitepaperId, whitepaperId));
  }

  async listByCategory(category: string): Promise<ClaimRow[]> {
    return this.db.select().from(claims).where(eq(claims.category, category));
  }
}

export class VerificationsRepo {
  constructor(private db: GreyDb) {}

  async deleteByWhitepaperId(whitepaperId: string): Promise<void> {
    await this.db.delete(verifications).where(eq(verifications.whitepaperId, whitepaperId));
  }

  async create(data: VerificationInsert): Promise<VerificationRow> {
    const rows = await this.db.insert(verifications).values(data).returning();
    return rows[0];
  }

  async findByWhitepaperId(whitepaperId: string): Promise<VerificationRow | null> {
    const rows: VerificationRow[] = await this.db
      .select()
      .from(verifications)
      .where(eq(verifications.whitepaperId, whitepaperId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Get all PASS verdicts from today (Greenlight List) */
  async getGreenlightList(): Promise<VerificationRow[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return this.db
      .select()
      .from(verifications)
      .where(and(eq(verifications.verdict, 'PASS'), gte(verifications.verifiedAt, todayStart)));
  }

  /** Get all FAIL verdicts with hype_tech_ratio > 3.0 (Scam Alerts) */
  async getScamAlerts(): Promise<VerificationRow[]> {
    return this.db
      .select()
      .from(verifications)
      .where(and(eq(verifications.verdict, 'FAIL'), gte(verifications.hypeTechRatio, 3.0)));
  }

  /** Get all verifications from the most recent cron run (latest batch by verified_at) */
  async getLatestDailyBatch(): Promise<VerificationRow[]> {
    const latest: VerificationRow[] = await this.db
      .select()
      .from(verifications)
      .orderBy(desc(verifications.verifiedAt))
      .limit(1);

    if (latest.length === 0) return [];

    const latestDate = latest[0].verifiedAt;
    const dayStart = new Date(latestDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return this.db
      .select()
      .from(verifications)
      .where(
        and(
          gte(verifications.verifiedAt, dayStart),
          sql`${verifications.verifiedAt} < ${dayEnd.toISOString()}::timestamptz`,
        ),
      );
  }

  /** Get verifications from a specific date (UTC). Used for date-specific briefings. */
  async getVerificationsByDate(dateStr: string): Promise<VerificationRow[]> {
    const dayStart = new Date(dateStr + 'T00:00:00Z');
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return this.db
      .select()
      .from(verifications)
      .where(
        and(
          gte(verifications.verifiedAt, dayStart),
          sql`${verifications.verifiedAt} < ${dayEnd.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(desc(verifications.verifiedAt));
  }

  /** Get the N most recent verifications regardless of date */
  async getMostRecent(limit: number): Promise<VerificationRow[]> {
    return this.db
      .select()
      .from(verifications)
      .orderBy(desc(verifications.verifiedAt))
      .limit(limit);
  }

  async listByVerdict(verdict: string): Promise<VerificationRow[]> {
    return this.db.select().from(verifications).where(eq(verifications.verdict, verdict));
  }

  /** Get monthly cost aggregation from persisted verification data */
  async getMonthlyCostSummary(): Promise<{
    totalVerifications: number;
    liveRuns: number;
    cacheHits: number;
    totalCostUsd: number;
    l2CostUsd: number;
    l3CostUsd: number;
    avgCostPerVerification: number;
    cacheHitRate: number;
  }> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows: VerificationRow[] = await this.db
      .select()
      .from(verifications)
      .where(gte(verifications.verifiedAt, monthStart));

    const total = rows.length;
    const cacheHits = rows.filter((r) => r.cacheHit).length;
    const liveRuns = total - cacheHits;
    const totalCostUsd = rows.reduce((sum, r) => sum + (r.computeCostUsd ?? 0), 0);
    const l2CostUsd = rows.reduce(
      (sum, r) => sum + (((r as Record<string, unknown>).l2CostUsd as number) ?? 0),
      0,
    );
    const l3CostUsd = rows.reduce(
      (sum, r) => sum + (((r as Record<string, unknown>).l3CostUsd as number) ?? 0),
      0,
    );

    return {
      totalVerifications: total,
      liveRuns,
      cacheHits,
      totalCostUsd,
      l2CostUsd,
      l3CostUsd,
      avgCostPerVerification: total > 0 ? totalCostUsd / total : 0,
      cacheHitRate: total > 0 ? cacheHits / total : 0,
    };
  }
}

// ── New-architecture repos (not in plugin-wpv) ──────────────────────

export class RequestsRepo {
  constructor(private db: GreyDb) {}

  async create(data: RequestInsert): Promise<RequestRow> {
    const rows = await this.db.insert(requests).values(data).returning();
    return rows[0];
  }

  async markCompleted(id: string): Promise<void> {
    await this.db
      .update(requests)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(requests.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(requests)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(requests.id, id));
  }
}

export class CostEventsRepo {
  constructor(private db: GreyDb) {}

  async create(data: CostEventInsert): Promise<CostEventRow> {
    const rows = await this.db.insert(costEvents).values(data).returning();
    return rows[0];
  }
}
