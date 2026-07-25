// FDQ-73 expiry/terminal reconciliation sweep.
//
// WHY: the SDK never delivers job.expired / job.rejected to the adapter — acpAgent.fireHandler
// (the sole path to the entry handler, used by both live dispatch AND startup hydrateSessions)
// hard-returns on !session.shouldRespond(entry), and jobSession.shouldRespond's RESPONDERS map
// omits job.expired and sets job.rejected:[] → both return false. There is no client-side expiry
// timer, and the delivery poll is FUNDED-only. So a submitted-then-terminal job that isn't
// `completed` strands as status='submitted' forever and no stiff is ever recorded — the ladder
// can't advance. This sweep closes that gap; it is a hard prerequisite for flip-to-enforce.
//
// PORT NOTE (plugin-acp reconcileTrackedJobs, read-only under lock #5): the source TRIGGERED on
// "tracked job dropped out of the live active set", then read getJob() to discriminate the
// terminal. We trigger on `expires_at < now` instead (a bounded SELECT — see reputationDb) and keep
// the source's authoritative-status discrimination. This is tighter and avoids the source's
// "dropped from active but actually still live" ambiguity: a past-SLA row whose ON-CHAIN status is
// still funded/open maps to null → left `submitted`, retried next tick. Only a genuinely terminal
// on-chain status resolves the row. Marking a rejected job as expired-and-stiffed would be a false
// strike — the failure mode this discrimination prevents.
//
// SAFETY: reads job status + writes reputation tables ONLY — it NEVER signs (no setBudget/submit/
// reject), so it is safe under OBSERVE_ONLY. Fail-soft: a sweep-level error skips the tick; a
// per-row error skips that row; nothing throws into the poll loop. Idempotent: it resolves via the
// gate's onJobTerminal, whose resolveIfSubmitted `WHERE status='submitted'` guard makes a real
// event (or a concurrent sweep) that also arrives a no-op for the second observer.
import type { AdapterLogger } from '../logger.js';
import type { JobTerminalStatus } from '../acpTypes.js';
import type { TrackedJobsRepo, TrackedTerminalStatus } from './reputationDb.js';

/** Fetch the authoritative job status (REST string) for a job, or null when unavailable. */
export type JobStatusFetch = (chainId: number, jobId: string) => Promise<string | null>;

export interface ReputationReconcilerOptions {
  trackedRepo: TrackedJobsRepo;
  /** The gate's onJobTerminal — idempotent resolve (+ a stiff only for genuine expiry). */
  onTerminal: (jobId: string, chainId: number, terminal: JobTerminalStatus) => Promise<void>;
  logger: AdapterLogger;
  /** Max rows per sweep (bounded). Default 100. */
  limit?: number;
  /** Injectable clock for deterministic tests. */
  clock?: () => Date;
}

/** Map an authoritative job-status string to the terminal we act on, or null (still live/unknown →
 *  leave `submitted`, retry next tick). Matches the REST-string convention of the funded filter. */
export function toTerminal(raw: string | null): TrackedTerminalStatus | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    default:
      return null; // funded / open / unknown → not yet terminal
  }
}

export class ReputationReconciler {
  private readonly trackedRepo: TrackedJobsRepo;
  private readonly onTerminal: (jobId: string, chainId: number, terminal: JobTerminalStatus) => Promise<void>;
  private readonly log: AdapterLogger;
  private readonly limit: number;
  private readonly clock: () => Date;

  constructor(opts: ReputationReconcilerOptions) {
    this.trackedRepo = opts.trackedRepo;
    this.onTerminal = opts.onTerminal;
    this.log = opts.logger;
    this.limit = opts.limit ?? 100;
    this.clock = opts.clock ?? ((): Date => new Date());
  }

  /** One reconciliation tick. `fetchJobStatus` reads the authoritative on-chain/API status. */
  async sweep(fetchJobStatus: JobStatusFetch): Promise<void> {
    let rows;
    try {
      rows = await this.trackedRepo.listExpiredSubmitted(this.clock().toISOString(), this.limit);
    } catch (err) {
      this.log.warn('[reconcile] listExpiredSubmitted failed — skipping tick', { error: errMsg(err) });
      return;
    }
    if (rows.length === 0) return;
    for (const row of rows) {
      try {
        const terminal = toTerminal(await fetchJobStatus(row.chainId, row.jobId));
        if (!terminal) continue; // still live/funded/unknown — leave `submitted`, retry next tick
        // Idempotent: onJobTerminal → resolveIfSubmitted (guarded) → stiff ONLY for 'expired'.
        await this.onTerminal(row.jobId, row.chainId, terminal);
        this.log.info('[reconcile] resolved stranded submitted job', {
          chainId: row.chainId,
          jobId: row.jobId,
          terminal,
        });
      } catch (err) {
        this.log.warn('[reconcile] row failed — skipping', {
          chainId: row.chainId,
          jobId: row.jobId,
          error: errMsg(err),
        });
      }
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
