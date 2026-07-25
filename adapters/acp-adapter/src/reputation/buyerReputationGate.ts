// BuyerReputationGate (M6 Phase C′) — the concrete impl behind the adapter's nullable
// `reputationGate` seam (acpTypes.ts), backed by the Phase B grey_two tables. Ported from
// plugin-wpv/src/acp/BuyerReputationGate.ts (read-only reference under lock #5).
//
// WHAT'S BYTE-PORTED: the B.2 status ladder (clean→warned→timeout_1h→timeout_12h→blocked, one step
//   per stiff), the stiff definition (submitted-then-expired), the active-timeout check, first-
//   contact stub, and the cross-provider tally cache (TTL + fire-and-forget).
// WHAT CHANGED (deliberate, per the C′ directive):
//   1. Data layer: drizzle → raw SQL via BuyerRecordStore/TrackedJobsRepo (grey_two, not wpv_*).
//   2. Shadow gating is UNIFIED under a SINGLE flag. The source enforced timeouts always and only
//      shadowed `blocked`; the directive says while BUYER_GATING_BLOCK_ENABLED=false the gate NEVER
//      blocks (fail-open) — so evaluateAcceptance computes the full would-be verdict, records it,
//      but returns accept:true unless blockEnabled. Flip-to-enforce = one env change to true.
//   3. Dropped (no adapter caller): getMetricsSnapshot (no reputation heartbeat) and
//      getTrackedSubmittedJobs (no lifecycle-reconciliation loop; the adapter resolves terminals
//      from SSE/poll events only). The interface stays the 3 earning-path methods.
//   4. onJobSubmitted/onJobTerminal record FULLY regardless of the flag; evaluateAcceptance fails
//      OPEN on any error (the gate's own failure must never block earning).
import type { BuyerReputationGate, AcpJobInfo, JobTerminalStatus } from '../acpTypes.js';
import type { AdapterLogger } from '../logger.js';
import type {
  BuyerRecord,
  BuyerRecordStore,
  BuyerStatus,
  TrackedJobsRepo,
} from './reputationDb.js';

export interface BuyerGatingConfig {
  /** When false (shadow), the gate records but NEVER blocks. Flip to true to enforce. */
  blockEnabled: boolean;
  timeout1hSec: number;
  timeout12hSec: number;
  crossProviderCacheTtlSec: number;
}

/** Optional cross-provider on-chain history fetch (viem). Injected by main.ts when BASE_RPC_URL is
 *  set; omitted → cross-provider tallies simply stay 0 (never gated on — B.5/B.7). */
export type CrossProviderFetch = (
  walletLowercased: string,
) => Promise<{ completes_total: number; creates_total: number } | null>;

export interface BuyerReputationGateOptions {
  buyerStore: BuyerRecordStore;
  trackedRepo: TrackedJobsRepo;
  gating: BuyerGatingConfig;
  logger: AdapterLogger;
  crossProviderFetch?: CrossProviderFetch;
  /** Injectable clock for deterministic timeouts in tests. */
  clock?: () => Date;
}

interface Decision {
  accept: boolean;
  rejectReasonText?: string;
  rejectReasonStructured?: Record<string, unknown>;
}

export class BuyerReputationGateImpl implements BuyerReputationGate {
  private readonly buyerStore: BuyerRecordStore;
  private readonly trackedRepo: TrackedJobsRepo;
  private readonly gating: BuyerGatingConfig;
  private readonly log: AdapterLogger;
  private readonly crossProviderFetch?: CrossProviderFetch;
  private readonly clock: () => Date;

  constructor(opts: BuyerReputationGateOptions) {
    this.buyerStore = opts.buyerStore;
    this.trackedRepo = opts.trackedRepo;
    this.gating = opts.gating;
    this.log = opts.logger;
    this.crossProviderFetch = opts.crossProviderFetch;
    this.clock = opts.clock ?? ((): Date => new Date());
  }

  private norm(addr: string): string {
    return (addr ?? '').toLowerCase();
  }

  // ── acceptance (B.2), shadow-gated ─────────
  async evaluateAcceptance(job: AcpJobInfo): Promise<Decision> {
    const wallet = this.norm(job.buyerAddress);
    let rec: BuyerRecord | null = null;
    try {
      rec = await this.buyerStore.get(wallet);
    } catch (err) {
      // Fail-OPEN — the gate's own DB failure must never block earning.
      this.log.warn('[reputation] buyer lookup failed — accepting (fail-open)', {
        buyer: wallet,
        error: errMsg(err),
      });
      return { accept: true };
    }

    // First contact → stub + cross-provider history (both fire-and-forget, non-gating).
    if (!rec) this.onFirstContact(wallet, job.providerAddress);

    const decision = this.computeDecision(rec, job.providerAddress);

    if (!this.gating.blockEnabled) {
      // SHADOW: record the would-be verdict, but accept regardless.
      if (!decision.accept) {
        this.log.info('[reputation-shadow] would-reject (shadow-accepting; BLOCK_ENABLED=false)', {
          buyer: wallet,
          status: rec?.status ?? 'clean',
          reason: decision.rejectReasonStructured?.['reason'],
        });
      }
      return { accept: true };
    }
    // ENFORCING (post-flip): return the real decision.
    return decision;
  }

  /** The full B.2 would-be verdict (used verbatim when enforcing; recorded-only in shadow). */
  private computeDecision(rec: BuyerRecord | null, providerAddress: string): Decision {
    if (!rec) return { accept: true }; // unknown buyer → clean
    const status = rec.status;
    if (status === 'clean' || status === 'warned') return { accept: true };
    if (status === 'timeout_1h' || status === 'timeout_12h') {
      if (this.isInActiveTimeout(rec)) {
        const retryAfter = rec.timeoutUntil ? rec.timeoutUntil.toISOString() : null;
        return {
          accept: false,
          rejectReasonText: `Service temporarily unavailable for this buyer wallet — please retry after ${retryAfter}.`,
          rejectReasonStructured: { reason: 'buyer_in_timeout', retryAfter, providerAddress },
        };
      }
      // Timeout elapsed — back in service. Do NOT mutate status here (the stored status is what the
      // next stiff transition reads).
      return { accept: true };
    }
    if (status === 'blocked') {
      return {
        accept: false,
        rejectReasonText: 'Service permanently unavailable for this buyer wallet.',
        rejectReasonStructured: { reason: 'buyer_blocked', retryAfter: null, providerAddress },
      };
    }
    return { accept: true }; // unknown status → fail open
  }

  private isInActiveTimeout(rec: BuyerRecord): boolean {
    if (rec.status !== 'timeout_1h' && rec.status !== 'timeout_12h') return false;
    if (!rec.timeoutUntil) return false;
    return rec.timeoutUntil.getTime() > this.clock().getTime();
  }

  private onFirstContact(walletLc: string, _providerAddress: string): void {
    void this.buyerStore
      .insertStubIfAbsent(walletLc)
      .catch((err: unknown) => this.log.warn('[reputation] stub create failed (non-fatal)', { error: errMsg(err) }));
    if (this.crossProviderFetch) {
      void this.queryCrossProviderHistory(walletLc).catch(() => {
        /* fail-soft, logged inside */
      });
    }
  }

  // ── tracked-job lifecycle — records FULLY regardless of the flag ──
  async onJobSubmitted(
    jobId: string,
    chainId: number,
    buyerAddress: string,
    offering: string,
    submittedAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    await this.trackedRepo.trackSubmitted({
      chainId,
      jobId,
      buyerAddress: this.norm(buyerAddress),
      providerOffering: offering,
      submittedAt,
      expiresAt,
    });
  }

  async onJobTerminal(jobId: string, chainId: number, terminal: JobTerminalStatus): Promise<void> {
    // resolveIfSubmitted is the idempotency gate: transitions ONLY a still-`submitted` row and
    // returns the pre-update buyer for the FIRST observer; a socket+poll race's second observer
    // gets null and we skip (mirrors claimDispatch).
    const resolved = await this.trackedRepo.resolveIfSubmitted(chainId, jobId, terminal);
    if (!resolved) return; // already resolved by the other path, or never tracked
    if (terminal !== 'expired') {
      // completed / rejected = protocol used correctly. No stiff. (Completions do NOT clear strikes
      // in iteration 1 — spec B.2.)
      this.log.info('[reputation] job resolved — no stiff', { chainId, jobId, terminal });
      return;
    }
    // expired-from-submitted = a stiff. Apply the state-machine transition.
    await this.applyStiffTransition(resolved.buyerAddress);
  }

  // ── state machine (B.2) — UPDATE (upsert), never delete-reinsert ──
  private async applyStiffTransition(buyerAddress: string): Promise<void> {
    const wallet = this.norm(buyerAddress);
    const rec = await this.buyerStore.get(wallet);
    const now = this.clock();
    const cur = (rec?.status ?? 'clean') as BuyerStatus;

    let next: BuyerStatus = cur;
    let strikes = (rec?.strikes ?? 0) + 1;
    let timeoutUntil: Date | null = rec?.timeoutUntil ?? null;

    switch (cur) {
      case 'clean':
        next = 'warned';
        strikes = 1;
        timeoutUntil = null;
        break;
      case 'warned':
        next = 'timeout_1h';
        strikes = 2;
        timeoutUntil = new Date(now.getTime() + this.gating.timeout1hSec * 1000);
        break;
      case 'timeout_1h':
        next = 'timeout_12h';
        strikes = 3;
        timeoutUntil = new Date(now.getTime() + this.gating.timeout12hSec * 1000);
        break;
      case 'timeout_12h':
        next = 'blocked';
        strikes = 4;
        timeoutUntil = null;
        break;
      case 'blocked':
        next = 'blocked'; // terminal — bump strikes for record-keeping only
        break;
      default:
        next = 'warned';
        strikes = 1;
        timeoutUntil = null;
    }

    await this.buyerStore.writeStiff(wallet, { status: next, strikes, timeoutUntil, lastStiffAt: now });
    this.log.info('[reputation] stiff transition', { buyer: wallet, from: cur, to: next, strikes });
  }

  // ── cross-provider history (B.7 — cheap indexed signals, non-gating) ──
  private async queryCrossProviderHistory(walletLc: string): Promise<void> {
    if (!this.crossProviderFetch) return;
    try {
      const rec = await this.buyerStore.get(walletLc);
      if (rec?.crossProviderDataCachedAt) {
        const ageMs = this.clock().getTime() - rec.crossProviderDataCachedAt.getTime();
        if (ageMs < this.gating.crossProviderCacheTtlSec * 1000) return; // fresh cache — skip RPC
      }
      const result = await this.crossProviderFetch(walletLc);
      if (!result) return;
      await this.buyerStore.writeCrossProvider(walletLc, {
        completesTotal: result.completes_total,
        createsTotal: result.creates_total,
        cachedAt: this.clock(),
      });
    } catch (err) {
      // Fail-soft: iteration 1 does not gate on this data (spec B.5/B.7).
      this.log.warn('[reputation] cross-provider query failed (non-fatal)', { error: errMsg(err) });
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
