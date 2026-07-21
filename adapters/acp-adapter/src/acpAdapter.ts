// AcpAdapter — the ACP marketplace as a ChannelIngress (M6 Phase C). Standalone process; earning
// path only. It reuses grey-core's shared offering handlers verbatim (import { offeringHandlers,
// createHandlerDeps } from '@grey/core' — done in main.ts and passed in) and drives the ACP job
// lifecycle ported from plugin-acp's AcpService against the structural SDK shapes in acpTypes.ts.
//
// Ported (KEEP): SSE 'entry' subscription, poll backstop, claimDispatch dedup, "once funded, always
// submit, never reject", the two-part nudge. Dropped (A7): boot-buffer (offerings register before
// agent.start() — no cross-plugin load race in one process), the 2s/60s PM2-restart retry loop
// (systemd Restart=on-failure + fail-fast exit), and the HTTP 3001 handler.
//
// Two safety seams:
//   • OBSERVE_ONLY (FDQ-63): the FIRST thing handleJobCreated/handleJobFunded do — suppresses every
//     signing path (setBudget/submit/reject/nudge), covering hydration-fired entries.
//   • reputationGate (B6): a nullable injected collaborator, every call guarded by if(this.gate);
//     never hard-imported. Null in Phase C → exact "no gating" behavior; C′ wires a real impl.
import type { ChannelIngress, ChannelIdentity, OfferingRegistration, OfferingHandler } from '@grey/core';
import type {
  AcpSdkBundle,
  AcpAgentLike,
  AcpJobSession,
  AcpRoomEntry,
  AcpJobInfo,
  BuyerReputationGate,
  HandlerDeps,
  SharedHandlerInput,
} from './acpTypes.js';
import type { AcpAdapterConfig } from './config.js';
import { GREY_DID } from './config.js';
import { parseRequirement } from './parseRequirement.js';
import { createLogger, type AdapterLogger } from './logger.js';

/** Dedup TTL — 5 minutes. */
const DEDUP_TTL_MS = 5 * 60 * 1000;
/** Max dedup entries before a cleanup sweep. */
const DEDUP_CLEANUP_THRESHOLD = 100;
/** Max time to wait for the requirement message after job.created/funded. */
const REQUIREMENT_WAIT_MS = 5000;
/** Poll interval while waiting for the requirement message. */
const REQUIREMENT_POLL_INTERVAL_MS = 100;
/** Defense-in-depth SLA fallback if a job carries no usable expiredAt (conservative — longest SLA). */
const DEFAULT_SLA_MINUTES = 15;

export interface AcpAdapterOptions {
  config: AcpAdapterConfig;
  /** The injected SDK operations (main.ts builds the real one; tests inject a fake). */
  sdk: AcpSdkBundle;
  /** Shared handler deps (createHandlerDeps in main; fake repos in tests). */
  deps: HandlerDeps;
  /** The shared offering handlers (offeringHandlers from @grey/core; fakes in tests). */
  handlers: Record<string, OfferingHandler>;
  logger?: AdapterLogger;
  /** B6 seam — null in Phase C. */
  reputationGate?: BuyerReputationGate | null;
}

export class AcpAdapter implements ChannelIngress {
  private readonly config: AcpAdapterConfig;
  private readonly sdk: AcpSdkBundle;
  private readonly deps: HandlerDeps;
  private readonly handlers: Record<string, OfferingHandler>;
  private readonly log: AdapterLogger;
  private reputationGate: BuyerReputationGate | null;

  private agent: AcpAgentLike | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  // Catalog (registerOffering) — slug → price, for identity()/observability + the accept budget.
  private readonly offerings: OfferingRegistration[] = [];
  private readonly offeringPrices = new Map<string, number>();
  private readonly offeringSlaMinutes = new Map<string, number>();

  // Dedup — per `${jobId}:${eventType}` (TTL-swept).
  private readonly recentJobs = new Map<string, number>();
  // In-flight delivery guard — per `${chainId}:${jobId}` (never TTL-swept; released in the funded finally).
  private readonly inFlight = new Set<string>();
  // Poll log-once.
  private readonly pollSeen = new Map<string, number>();

  constructor(opts: AcpAdapterOptions) {
    this.config = opts.config;
    this.sdk = opts.sdk;
    this.deps = opts.deps;
    this.handlers = opts.handlers;
    this.log = opts.logger ?? createLogger({ component: 'acp-adapter' });
    this.reputationGate = opts.reputationGate ?? null;
  }

  // ── ChannelIngress ─────────────────────────

  async start(): Promise<void> {
    if (this.agent) throw new Error('AcpAdapter: already started');
    this.agent = await this.sdk.createAgent(
      {
        agentWalletAddress: this.config.agentWalletAddress,
        privyWalletId: this.config.privyWalletId,
        privySignerKey: this.config.privySignerKey,
      },
      (session, entry) => {
        void this.handleEntry(session, entry);
      },
    );
    await this.agent.start();
    this.startDeliveryPoll();
    this.log.info('AcpAdapter: started', {
      observeOnly: this.config.observeOnly,
      offerings: this.offerings.map((o) => o.slug),
      receivingAddress: this.config.agentWalletAddress,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.agent) {
      await this.agent.stop();
      this.agent = null;
    }
  }

  registerOffering(reg: OfferingRegistration): void {
    this.offerings.push(reg);
    this.offeringPrices.set(reg.slug, reg.priceUsd);
    this.log.info('AcpAdapter: offering registered', { slug: reg.slug, priceUsd: reg.priceUsd });
  }

  identity(): ChannelIdentity {
    return { receivingAddress: this.config.agentWalletAddress, did: GREY_DID };
  }

  /** Observability accessors (not on the slim ChannelIngress interface). */
  listOfferings(): readonly OfferingRegistration[] {
    return this.offerings;
  }
  setReputationGate(gate: BuyerReputationGate | null): void {
    this.reputationGate = gate;
  }

  // ── Ingress / dispatch ─────────────────────

  private startDeliveryPoll(): void {
    if (this.pollTimer) return;
    // NOT unref'd: the poll interval is what keeps the standalone daemon alive between SSE events;
    // stop() clears it for a clean exit.
    this.pollTimer = setInterval(() => {
      void this.runDeliveryPoll();
    }, this.config.pollIntervalMs);
  }

  /** Shared dispatch-claim primitive — the first synchronous check-and-set any path performs for a
   *  job+event, before any await, so socket-vs-poll races resolve deterministically. */
  private claimDispatch(chainId: number, jobId: string, eventType: string): boolean {
    const eventKey = `${jobId}:${eventType}`;
    const flightKey = `${chainId}:${jobId}`;
    if (this.recentJobs.has(eventKey) || (eventType === 'job.funded' && this.inFlight.has(flightKey))) {
      return false;
    }
    this.recentJobs.set(eventKey, Date.now());
    if (eventType === 'job.funded') this.inFlight.add(flightKey);
    if (this.recentJobs.size > DEDUP_CLEANUP_THRESHOLD) {
      const now = Date.now();
      for (const [k, ts] of this.recentJobs) {
        if (now - ts > DEDUP_TTL_MS) this.recentJobs.delete(k);
      }
    }
    return true;
  }

  async handleEntry(session: AcpJobSession, entry: AcpRoomEntry): Promise<void> {
    // Process system lifecycle events AND the initial requirement message (arrives as a separate
    // room entry, contentType='requirement', after job.created).
    const isRequirementMsg = entry.kind === 'message' && entry.contentType === 'requirement';
    if (!isRequirementMsg && entry.kind !== 'system') return;

    const eventType = isRequirementMsg ? 'requirement.message' : (entry.event?.type ?? '');
    const jobId = session.jobId;
    if (!eventType) return;

    // Dedup + in-flight claim — shared by the SSE path and the poll path.
    if (!this.claimDispatch(session.chainId, jobId, eventType)) return;

    const log = this.log.child({ operation: 'handleEntry', jobId, eventType });

    switch (eventType) {
      case 'job.created':
      case 'requirement.message': {
        const decidedKey = `${jobId}:__decided`;
        if (this.recentJobs.has(decidedKey)) break;
        await this.handleJobCreated(session, entry, log);
        break;
      }
      case 'job.funded':
        await this.handleJobFunded(session, log);
        break;
      case 'job.completed':
      case 'job.rejected':
      case 'job.expired':
        log.info('Job terminal state');
        if (this.reputationGate) {
          const terminal =
            eventType === 'job.completed' ? 'completed' : eventType === 'job.rejected' ? 'rejected' : 'expired';
          void this.reputationGate
            .onJobTerminal(session.jobId, session.chainId, terminal)
            .catch((err) => log.warn('[reputation] onJobTerminal (socket path) threw', { error: errMsg(err) }));
        }
        break;
      default:
        log.debug('Unhandled event type');
    }
  }

  // ── Accept phase ───────────────────────────

  private async handleJobCreated(
    session: AcpJobSession,
    entry: AcpRoomEntry,
    log: AdapterLogger,
  ): Promise<void> {
    // ── OBSERVE_ONLY (FDQ-63): the FIRST thing — before ANY signing path. Covers hydration-fired
    //    entries (agent.start()→hydrateSessions fires 'entry' on pre-existing active jobs). ──
    if (this.config.observeOnly) {
      await this.observe('job.created', session, entry, log);
      return;
    }

    const job = await session.fetchJob();
    const offeringId = job.description ?? '';
    const decidedKey = `${session.jobId}:__decided`;
    const markDecided = (): void => {
      this.recentJobs.set(decidedKey, Date.now());
    };

    if (!offeringId) {
      log.info('No offering name — skipping (not a serviceable job)');
      return;
    }
    const handler = this.handlers[offeringId];
    if (!handler) {
      log.warn('No handler registered for offering — rejecting', { offeringId });
      await session.reject(`Offering '${offeringId}' not supported by this agent`);
      markDecided();
      return;
    }

    const rawRequirement = await this.resolveRawRequirement(session, entry);
    const { requirement, isPlainText } = parseRequirement(rawRequirement);
    if (!hasSubject(requirement)) {
      log.warn('No parseable requirement — rejecting');
      await session.reject('Could not parse service requirement — no token address or project name found');
      markDecided();
      return;
    }

    // Buyer-reputation gate (B6) — after offering + requirement checks, before setBudget. Null in
    // Phase C → skipped entirely. Fail-OPEN: a gate error accepts (never blocks honest buyers).
    if (this.reputationGate) {
      try {
        const decision = await this.reputationGate.evaluateAcceptance({
          jobId: session.jobId,
          chainId: session.chainId,
          phase: 'created',
          buyerAddress: job.clientAddress,
          providerAddress: this.config.agentWalletAddress,
          offeringName: offeringId,
        });
        if (!decision.accept) {
          const reason = decision.rejectReasonStructured
            ? JSON.stringify(decision.rejectReasonStructured)
            : (decision.rejectReasonText ?? 'Service unavailable for this buyer wallet');
          log.warn('[reputation-reject] buyer rejected by reputation gate', { buyer: job.clientAddress });
          await session.reject(reason);
          markDecided();
          return;
        }
      } catch (err) {
        log.warn('[reputation] evaluateAcceptance threw — accepting (fail-open)', { error: errMsg(err) });
      }
    }

    // Accept: propose the registered sticker price (no dynamic price resolver in the adapter).
    const price = this.offeringPrices.get(offeringId) ?? 0;
    void isPlainText;
    try {
      await session.setBudget(this.sdk.assetUsdc(price, session.chainId));
      log.info('Job accepted via setBudget', { offeringId, price });
      markDecided();
    } catch (err) {
      log.error('Failed to setBudget — attempting reject to avoid a hanging job', { error: errMsg(err) });
      try {
        await session.reject('Internal error: failed to set budget');
        markDecided();
      } catch (rejectErr) {
        log.error('Failed to reject after setBudget failure — job will expire on-chain', {
          error: errMsg(rejectErr),
        });
      }
    }
  }

  // ── Delivery phase ─────────────────────────

  private async handleJobFunded(session: AcpJobSession, log: AdapterLogger): Promise<void> {
    const flightKey = `${session.chainId}:${session.jobId}`;
    try {
      // ── OBSERVE_ONLY (FDQ-63): FIRST — before the submit path. ──
      if (this.config.observeOnly) {
        await this.observe('job.funded', session, undefined, log);
        return;
      }

      // Pre-submit re-check (optimization) — a FRESH fetch to skip a job already advanced past
      // funded. Fail-OPEN: only skip on an AFFIRMATIVE non-funded status.
      let job: Awaited<ReturnType<AcpJobSession['fetchJob']>> | null = null;
      try {
        job = await session.fetchJob();
      } catch (err) {
        log.warn('Pre-submit re-check: fetchJob failed — proceeding with cached job', { error: errMsg(err) });
        job = session.job ?? null;
      }
      if (!job) {
        log.error('No job available in funded phase — cannot deliver');
        return;
      }
      const statusStr = String((job as { status?: unknown }).status ?? '').toUpperCase();
      if (statusStr && statusStr !== 'FUNDED') {
        log.info('Pre-submit re-check: job no longer funded — skipping (already handled)', { status: statusStr });
        return;
      }

      const offeringId = job.description ?? '';
      const handler = offeringId ? this.handlers[offeringId] : undefined;
      if (!offeringId || !handler) {
        log.error('No offering/handler in funded phase — skipping delivery', { offeringId });
        return;
      }

      const rawRequirement = await this.waitForRequirement(session);
      const { requirement, isPlainText } = parseRequirement(rawRequirement);
      const input: SharedHandlerInput = {
        jobId: session.jobId,
        offeringId,
        buyerAddress: job.clientAddress,
        requirement,
        isPlainText,
      };

      // Post-acceptance rule: once funded, ALWAYS deliver. Never reject here. Handler errors become
      // an INSUFFICIENT_DATA deliverable.
      try {
        const result = await handler(input, this.deps);
        await session.submit(JSON.stringify({ type: 'object', value: result.payload }));
        log.info('Job delivered via submit()', { offeringId });
        await this.postSubmitNudgeAndTrack(
          session,
          offeringId,
          job.clientAddress,
          (job as { expiredAt?: unknown }).expiredAt,
          log,
        );
      } catch (err) {
        const errorMsg = errMsg(err);
        log.error('Handler errored — delivering INSUFFICIENT_DATA envelope', { error: errorMsg });
        try {
          await session.submit(
            JSON.stringify({
              type: 'object',
              value: {
                verdict: 'INSUFFICIENT_DATA',
                error: errorMsg,
                generatedAt: new Date().toISOString(),
              },
            }),
          );
          log.info('Fallback INSUFFICIENT_DATA deliverable submitted');
        } catch (submitErr) {
          log.error('CRITICAL: submit failed on error path', { error: errMsg(submitErr) });
        }
      }
    } finally {
      this.inFlight.delete(flightKey);
    }
  }

  /**
   * Post-submit: (1) send the two-part nudge asking the buyer to call complete(), and (2) record the
   * job in the reputation tracker. Both best-effort + independent; neither can fail the (already
   * complete) delivery. SLA source = the protocol's own job.expiredAt (matches on-chain), with the
   * per-offering SLA + a 15min default only as defense-in-depth.
   */
  private async postSubmitNudgeAndTrack(
    session: AcpJobSession,
    offeringId: string,
    buyerAddress: string,
    jobExpiredAt: unknown,
    log: AdapterLogger,
  ): Promise<void> {
    const submittedAt = new Date();
    const expSec =
      typeof jobExpiredAt === 'bigint'
        ? Number(jobExpiredAt)
        : typeof jobExpiredAt === 'number'
          ? jobExpiredAt
          : typeof jobExpiredAt === 'string'
            ? Number(jobExpiredAt)
            : NaN;
    let expiresAt: Date;
    if (Number.isFinite(expSec) && expSec > 0) {
      expiresAt = new Date(expSec * 1000);
    } else {
      const slaMinutes = this.offeringSlaMinutes.get(offeringId) ?? DEFAULT_SLA_MINUTES;
      expiresAt = new Date(submittedAt.getTime() + slaMinutes * 60 * 1000);
      log.warn('[reputation] job carried no usable expiredAt — SLA-default fallback', { offeringId, slaMinutes });
    }

    const nudgeText =
      `Deliverable submitted for job ${session.jobId}. Please call complete() to finalize the ` +
      `transaction within the SLA window. If you encountered an issue with the deliverable, please ` +
      `call reject() with a reason instead.`;
    const nudgeStructured = JSON.stringify({
      action: 'complete_required',
      jobId: session.jobId,
      slaExpiresAt: expiresAt.toISOString(),
      providerAddress: this.config.agentWalletAddress,
    });
    try {
      await session.sendMessage(nudgeText, 'text');
    } catch (err) {
      log.warn('[nudge] text message failed (continuing)', { error: errMsg(err) });
    }
    try {
      await session.sendMessage(nudgeStructured, 'structured');
    } catch (err) {
      log.warn('[nudge] structured message failed (continuing)', { error: errMsg(err) });
    }

    if (this.reputationGate) {
      try {
        await this.reputationGate.onJobSubmitted(
          session.jobId,
          session.chainId,
          buyerAddress,
          offeringId,
          submittedAt,
          expiresAt,
        );
      } catch (err) {
        log.warn('[reputation] onJobSubmitted failed (delivery already complete)', { error: errMsg(err) });
      }
    }
  }

  // ── Observe-only (read-only) ───────────────

  /** Read-only observation for tier-2: fetch + parse the job, log it, sign NOTHING. */
  private async observe(
    phase: string,
    session: AcpJobSession,
    entry: AcpRoomEntry | undefined,
    log: AdapterLogger,
  ): Promise<void> {
    try {
      const job = await session.fetchJob();
      const offeringId = job.description ?? '';
      const raw = entry?.contentType === 'requirement' ? entry.content : await this.waitForRequirement(session);
      const { requirement } = parseRequirement(raw);
      log.info('[observe-only] observed job — signing suppressed', {
        phase,
        offeringId,
        buyer: job.clientAddress,
        requirement,
      });
    } catch (err) {
      log.warn('[observe-only] observation read failed (no signing attempted)', { phase, error: errMsg(err) });
    }
  }

  // ── Poll backstop ──────────────────────────

  private async runDeliveryPoll(): Promise<void> {
    if (!this.agent) return;
    const ourAddr = this.config.agentWalletAddress.toLowerCase();
    let jobs: AcpJobInfo[];
    try {
      jobs = await this.getActiveJobs();
    } catch (err) {
      this.log.warn('[poll] getActiveJobs failed', { error: errMsg(err) });
      return;
    }
    const now = Date.now();
    if (this.pollSeen.size > DEDUP_CLEANUP_THRESHOLD) {
      for (const [k, ts] of this.pollSeen) {
        if (now - ts > DEDUP_TTL_MS) this.pollSeen.delete(k);
      }
    }
    for (const job of jobs) {
      const isFunded = String(job.phase).toUpperCase() === 'FUNDED';
      const isOurs = (job.providerAddress ?? '').toLowerCase() === ourAddr;
      if (!isFunded || !isOurs) continue;
      const jobId = String(job.jobId);
      const chainId = job.chainId;
      if (!this.pollSeen.has(jobId)) this.pollSeen.set(jobId, now);
      // Read-only early-out (NOT a second dedup site — the authoritative claim is claimDispatch).
      if (this.inFlight.has(`${chainId}:${jobId}`) || this.recentJobs.has(`${jobId}:job.funded`)) continue;
      void this.dispatchPolledJob(chainId, jobId);
    }
  }

  private async dispatchPolledJob(chainId: number, jobId: string): Promise<void> {
    if (!this.agent) return;
    try {
      let session = this.agent.getSession(chainId, jobId) ?? null;
      if (!session) {
        const entries = await this.agent.getTransport().getHistory(chainId, jobId);
        session = this.sdk.newSession(this.agent, this.config.agentWalletAddress, jobId, chainId, entries);
      }
      const syntheticEntry: AcpRoomEntry = {
        kind: 'system',
        onChainJobId: jobId,
        chainId,
        event: { type: 'job.funded', jobId },
        timestamp: Date.now(),
      };
      await this.handleEntry(session, syntheticEntry);
    } catch (err) {
      this.log.warn('[poll] dispatch failed', { jobId, error: errMsg(err) });
    }
  }

  private async getActiveJobs(): Promise<AcpJobInfo[]> {
    if (!this.agent) return [];
    const api = this.agent.getApi();
    const refs = await api.getActiveJobs();
    const jobs: AcpJobInfo[] = [];
    for (const ref of refs) {
      try {
        const full = await api.getJob(ref.chainId, ref.onChainJobId);
        if (full) {
          jobs.push({
            jobId: ref.onChainJobId,
            chainId: ref.chainId,
            phase: String((full as { status?: unknown; jobStatus?: unknown }).jobStatus ?? full.status ?? 'unknown'),
            buyerAddress: full.clientAddress ?? '',
            providerAddress: full.providerAddress ?? '',
            offeringName: full.description ?? '',
          });
        }
      } catch {
        // Individual job fetch failed — skip.
      }
    }
    return jobs;
  }

  // ── Requirement resolution ─────────────────

  private async resolveRawRequirement(session: AcpJobSession, entry: AcpRoomEntry): Promise<unknown> {
    if (entry.kind === 'message' && entry.contentType === 'requirement') return entry.content;
    return this.waitForRequirement(session);
  }

  private async waitForRequirement(session: AcpJobSession): Promise<unknown> {
    const deadline = Date.now() + REQUIREMENT_WAIT_MS;
    const findIn = (entries: readonly AcpRoomEntry[]): AcpRoomEntry | undefined =>
      entries.find((e) => e.kind === 'message' && e.contentType === 'requirement');

    const fast = findIn(session.entries);
    if (fast) return fast.content;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, REQUIREMENT_POLL_INTERVAL_MS));
      const found = findIn(session.entries);
      if (found) return found.content;
    }

    try {
      const history = await this.agent?.getTransport().getHistory(session.chainId, session.jobId);
      const found = history ? findIn(history) : undefined;
      return found?.content;
    } catch {
      return undefined;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A requirement is serviceable if it resolved at least one subject key. */
function hasSubject(r: { token_address?: string; project_name?: string }): boolean {
  return Boolean(r.token_address || r.project_name);
}
