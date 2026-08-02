// @grey/core deps — DI container + factory. grey-core consumes @grey/pipeline's DB stack
// (Q3=(c) proxy) via GREY_DATABASE_URL. Per FDQ-1, M3 is cache-READ-only: NO anthropic client,
// NO costTracker, NO runFullPipeline — the deps carry repos + db + logger only. (The spec's
// pre-FDQ-1 §3 Q2 listed `anthropic`/`costTracker`; the FDQ-1 ratification + the Phase C
// no-live-anthropic grep require omitting them. PHASE-B-PROGRESS notes this.)
import {
  createDeps,
  createLogger,
  createDiscoveryStack,
  WhitepapersRepo,
  VerificationsRepo,
  ClaimsRepo,
  RevenueEventsRepo,
  type GreyDb,
  type Logger,
  type PipelineDeps,
} from '@grey/pipeline';

/** Static identity/version config surfaced by /health + /identity and the envelope `agent`. */
export interface GreyCoreConfig {
  version: string;
  did: string;
  name: string;
  runtime: string;
  /** x402 receiver address (read-only). The relayer signing key lives ONLY in
   *  @grey/x402-middleware (invariant #19) — grey-core never holds a private key. */
  payTo: string;
  /** x402 network (CAIP-2, e.g. `eip155:8453`). */
  network: string;
}

/** grey-core DI shape. Ingress-agnostic (no Fastify coupling) so the M5 ACP adapter reuses it. */
export interface HandlerDeps {
  db: GreyDb;
  whitepapers: WhitepapersRepo;
  verifications: VerificationsRepo;
  claims: ClaimsRepo;
  /** E1-F: append-only revenue ledger, written by the route/MCP layer after settle() succeeds
   *  (offerings.ts, trustRung.ts, mcp.ts). The only WRITE repo on HandlerDeps — everything else
   *  here is cache-read (M3's "cache-read-only" posture, unchanged for whitepapers/verifications/
   *  claims). See packages/grey-pipeline/src/persistence/repositories.ts's MarginRepo for the
   *  read/aggregation side. */
  revenueEvents: RevenueEventsRepo;
  logger: Logger;
  /** Injectable clock for deterministic timestamps in tests. */
  clock: () => Date;
  config: GreyCoreConfig;
  // ── M3.5 (§15): live-compute DI for the cache-miss path (cacheOrLive) ──
  /**
   * Full pipeline deps bundle (anthropic + db + cost + logger + model + cryptoResolver), built once
   * per process via `@grey/pipeline`'s `createDeps()`. cacheOrLive spreads it with a fresh
   * per-request CostTracker. Carrying the bundle keeps grey-core free of `@anthropic-ai/` /
   * `createAnthropicClient` (invariant #11) — the anthropic client is DI'd, never constructed here.
   */
  pipeline: PipelineDeps;
  /**
   * Tiered document discovery stack, built once per process via `createDiscoveryStack`. Typed via
   * an inline `import(...)` so the §15-sanctioned discovery-stack DI type reference appears EXACTLY
   * ONCE in grey-core/src (the annotation below) — the §16 single allowed invariant-#14 exception.
   */
  discovery: import('@grey/pipeline').TieredDocumentDiscovery;
}

export interface CreateHandlerDepsEnv {
  databaseUrl?: string;
  version?: string;
  clock?: () => Date;
}

// Keep in sync with package.json `version`.
const GREY_CORE_VERSION = '0.1.0';

const IDENTITY: Omit<GreyCoreConfig, 'version' | 'payTo' | 'network'> = {
  did: 'did:erc8004:8453:58618', // Grey's on-chain ERC-8004 DID — Base mainnet, tokenId 58618 (Movement 4 Phase C mint)
  name: 'Whitepaper Grey',
  runtime: 'grey-core',
};

/**
 * Build the runtime deps for production (start.ts). Reads GREY_DATABASE_URL (same credential
 * pipeline uses). NOT used in tests — tests construct HandlerDeps directly with mocked repos.
 */
export function createHandlerDeps(env: CreateHandlerDepsEnv = {}): HandlerDeps {
  const databaseUrl = env.databaseUrl ?? process.env.GREY_DATABASE_URL ?? '';
  // M3.5: build the pipeline deps bundle once (createDeps reads ANTHROPIC_API_KEY / GREY_MODEL /
  // GREY_DATABASE_URL); reuse its db connection for the cache-read repos so there's ONE pool.
  const pipeline = createDeps({ databaseUrl });
  const db = pipeline.db;
  return {
    db,
    whitepapers: new WhitepapersRepo(db),
    verifications: new VerificationsRepo(db),
    claims: new ClaimsRepo(db),
    revenueEvents: new RevenueEventsRepo(db),
    logger: createLogger({ component: 'grey-core' }),
    clock: env.clock ?? ((): Date => new Date()),
    config: {
      version: env.version ?? GREY_CORE_VERSION,
      ...IDENTITY,
      // Informational read-only x402 context. Authoritative validation of these (plus the
      // relayer key + RPC) happens in @grey/x402-middleware's loadX402Config, used by start.ts
      // to build the paid-route gate. A plain env read here avoids requiring the key just to
      // populate the config surface.
      payTo: process.env.BASE_X402_PAY_TO ?? '',
      network: process.env.X402_NETWORK ?? '',
    },
    pipeline,
    discovery: createDiscoveryStack({
      githubToken: process.env.GITHUB_TOKEN,
      cmcApiKey: process.env.CMC_API_KEY,
    }),
  };
}
