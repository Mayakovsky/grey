// @grey/core deps — DI container + factory. grey-core consumes @grey/pipeline's DB stack
// (Q3=(c) proxy) via GREY_DATABASE_URL. Per FDQ-1, M3 is cache-READ-only: NO anthropic client,
// NO costTracker, NO runFullPipeline — the deps carry repos + db + logger only. (The spec's
// pre-FDQ-1 §3 Q2 listed `anthropic`/`costTracker`; the FDQ-1 ratification + the Phase C
// no-live-anthropic grep require omitting them. PHASE-B-PROGRESS notes this.)
import {
  createDb,
  createLogger,
  WhitepapersRepo,
  VerificationsRepo,
  ClaimsRepo,
  type GreyDb,
  type Logger,
} from '@grey/pipeline';

/** Static identity/version config surfaced by /health + /identity and the envelope `agent`. */
export interface GreyCoreConfig {
  version: string;
  did: string;
  name: string;
  runtime: string;
}

/** grey-core DI shape. Ingress-agnostic (no Fastify coupling) so the M5 ACP adapter reuses it. */
export interface HandlerDeps {
  db: GreyDb;
  whitepapers: WhitepapersRepo;
  verifications: VerificationsRepo;
  claims: ClaimsRepo;
  logger: Logger;
  /** Injectable clock for deterministic timestamps in tests. */
  clock: () => Date;
  config: GreyCoreConfig;
}

export interface CreateHandlerDepsEnv {
  databaseUrl?: string;
  version?: string;
  clock?: () => Date;
}

// Keep in sync with package.json `version`.
const GREY_CORE_VERSION = '0.1.0';

const IDENTITY: Omit<GreyCoreConfig, 'version'> = {
  did: 'did:placeholder:grey', // M4 swaps this for a deps-injected DID resolver
  name: 'Whitepaper Grey',
  runtime: 'grey-core',
};

/**
 * Build the runtime deps for production (start.ts). Reads GREY_DATABASE_URL (same credential
 * pipeline uses). NOT used in tests — tests construct HandlerDeps directly with mocked repos.
 */
export function createHandlerDeps(env: CreateHandlerDepsEnv = {}): HandlerDeps {
  const databaseUrl = env.databaseUrl ?? process.env.GREY_DATABASE_URL ?? '';
  const db = createDb(databaseUrl);
  return {
    db,
    whitepapers: new WhitepapersRepo(db),
    verifications: new VerificationsRepo(db),
    claims: new ClaimsRepo(db),
    logger: createLogger({ component: 'grey-core' }),
    clock: env.clock ?? ((): Date => new Date()),
    config: { version: env.version ?? GREY_CORE_VERSION, ...IDENTITY },
  };
}
