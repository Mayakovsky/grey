// Structural interfaces for the slice of the @virtuals-protocol/acp-node-v2 SDK the adapter
// actually touches — the grey-sweeper `*Like` pattern (real viem clients cast to local shapes).
// The adapter core depends ONLY on these, never on the SDK's own types, so it typechecks/tests/
// builds with none of the SDK's heavy transitive tree present. src/sdk.ts maps the real SDK to
// these shapes at runtime (the single place the SDK is loaded, via dynamic import).
import type { HandlerDeps, HandlerInput, OfferingHandler } from '@grey/core';

/** A room entry as read by handleEntry — system lifecycle event OR a requirement message. */
export interface AcpRoomEntry {
  kind: string; // 'system' | 'message' | …
  /** message entries: 'requirement' etc. */
  contentType?: string;
  /** message entries: the requirement content (string JSON or plain text, or an object). */
  content?: unknown;
  /** system entries: the lifecycle event. */
  event?: { type: string; jobId?: string; client?: string; amount?: number };
  timestamp?: number;
  onChainJobId?: string;
  chainId?: number;
}

/** The protocol-authoritative job record (REST shape; `status` carries the REST string at runtime). */
export interface AcpJob {
  description?: string; // the offering slug
  clientAddress: string; // buyer
  providerAddress?: string;
  status?: unknown; // REST string e.g. "funded" (typed loose — the SDK's numeric-enum type lies about REST)
  expiredAt?: unknown; // unix seconds (bigint|number|string) — SLA source of truth
  budget?: unknown;
}

/** A job session — the per-job room handle the adapter drives. */
export interface AcpJobSession {
  readonly jobId: string;
  readonly chainId: number;
  readonly roles: readonly string[];
  readonly entries: readonly AcpRoomEntry[];
  readonly job?: AcpJob | null;
  fetchJob(): Promise<AcpJob>;
  /** Propose the budget (accept). `budget` is an opaque SDK AssetToken (bundle.assetUsdc). */
  setBudget(budget: unknown): Promise<void>;
  /** Deliver the (stringified) deliverable. */
  submit(deliverable: string): Promise<void>;
  /** Post-submit nudge messages. */
  sendMessage(content: string, contentType: string): Promise<void>;
  /** Pre-acceptance rejection. */
  reject(reason: string): Promise<void>;
}

/** A job reference from the REST active-jobs list. */
export interface AcpJobRef {
  chainId: number;
  onChainJobId: string;
}

/** The SDK agent handle. */
export interface AcpAgentLike {
  on(event: 'entry', cb: (session: AcpJobSession, entry: AcpRoomEntry) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  getSession(chainId: number, jobId: string): AcpJobSession | null | undefined;
  getTransport(): { getHistory(chainId: number, jobId: string): Promise<AcpRoomEntry[]> };
  getApi(): {
    getActiveJobs(): Promise<AcpJobRef[]>;
    getJob(chainId: number, jobId: string): Promise<AcpJob | null>;
  };
  getAddress(): Promise<string>;
}

/** Config the SDK bundle needs to construct the Privy non-custodial agent (Q6 — reuse 0xa966…). */
export interface AcpAgentConfig {
  agentWalletAddress: string;
  privyWalletId: string;
  privySignerKey: string;
}

/**
 * The injected SDK operations. main.ts builds the REAL bundle (src/sdk.ts, dynamic-imports the
 * SDK); tests/tier-1 inject a fake. This is the ONLY seam through which SDK values enter the
 * adapter — the adapter never imports the SDK directly.
 */
export interface AcpSdkBundle {
  /** Construct + wire the Privy non-custodial agent over SSE (no on-chain write — FDQ-63). */
  createAgent(
    config: AcpAgentConfig,
    onEntry: (session: AcpJobSession, entry: AcpRoomEntry) => void,
  ): Promise<AcpAgentLike>;
  /** AssetToken.usdc(amount, chainId) — opaque budget value for setBudget. */
  assetUsdc(amount: number, chainId: number): unknown;
  /** Construct a JobSession for a polled funded job with no hydrated session (mirrors hydrateSessions). */
  newSession(
    agent: AcpAgentLike,
    providerAddress: string,
    jobId: string,
    chainId: number,
    entries: AcpRoomEntry[],
  ): AcpJobSession;
}

/** A simplified funded-job projection used by the poll backstop. */
export interface AcpJobInfo {
  jobId: string;
  chainId: number;
  phase: string;
  buyerAddress: string;
  providerAddress: string;
  offeringName?: string;
}

/** Terminal lifecycle states a tracked job can resolve to. */
export type JobTerminalStatus = 'completed' | 'expired' | 'rejected';

/**
 * Buyer-reputation gate seam (B6) — optional-by-construction. The adapter holds this as a nullable
 * injected collaborator and guards every call with `if (this.reputationGate)`. NEVER hard-imported.
 * In Phase C it is always null (→ exact "no gating" behavior); C′ wires a real impl to Phase B's
 * grey_two tables. Interface kept minimal (the earning-path sites only); C′ may extend it.
 */
export interface BuyerReputationGate {
  /** handleJobCreated, BEFORE setBudget. accept:false → the adapter relays the structured reject. */
  evaluateAcceptance(job: AcpJobInfo): Promise<{
    accept: boolean;
    rejectReasonText?: string;
    rejectReasonStructured?: Record<string, unknown>;
  }>;
  /** handleJobFunded, immediately after a successful submit(). */
  onJobSubmitted(
    jobId: string,
    chainId: number,
    buyerAddress: string,
    offering: string,
    submittedAt: Date,
    expiresAt: Date,
  ): Promise<void>;
  /** handleEntry terminal events (best-effort fast path). */
  onJobTerminal(jobId: string, chainId: number, terminal: JobTerminalStatus): Promise<void>;
}

/** The parsed-requirement input handed to the shared grey-core handlers. Re-uses HandlerInput. */
export type SharedHandlerInput = HandlerInput;
export type { HandlerDeps, OfferingHandler };
