// grey-pipeline — dependency container + factory.
// FWD-4: every stage function takes (input, deps). PipelineDeps holds the injected
// service clients + db + logger + cost tracker. createDeps() wires the real
// implementations from env; tests inject mocks directly.

import type { AnthropicClient } from './clients/anthropic';
import type { GreyDb } from './persistence/client';
import type { Logger } from './logger';
import type { SemanticScholarClient } from './evaluation/claimEvaluator';
import { createAnthropicClient } from './clients/anthropic';
import { createDb } from './persistence/client';
import { CostTracker } from './telemetry/costTracker';
import { createLogger } from './logger';
import { LLM_PRICING } from './constants';

export interface PipelineDeps {
  anthropic: AnthropicClient;
  db: GreyDb;
  cost: CostTracker;
  logger: Logger;
  /** Model override; defaults to GREY_MODEL inside the stages. */
  model?: string;
  /** Optional citation-verification client (L3). */
  semanticScholar?: SemanticScholarClient;
}

export interface DepsEnv {
  anthropicApiKey?: string;
  databaseUrl?: string;
  model?: string;
}

/**
 * Build real deps from env. `ANTHROPIC_API_KEY` and `GREY_DATABASE_URL` are read
 * from the environment if not passed explicitly. (GREY_DATABASE_URL = the
 * grey_pipeline_rw scoped role connection — runtime credential, NOT the migration
 * credential.)
 */
export function createDeps(env: DepsEnv = {}): PipelineDeps {
  const anthropicApiKey = env.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  const databaseUrl = env.databaseUrl ?? process.env.GREY_DATABASE_URL ?? '';
  return {
    anthropic: createAnthropicClient(anthropicApiKey),
    db: createDb(databaseUrl),
    cost: new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken),
    logger: createLogger({ component: 'grey-pipeline' }),
    model: env.model ?? process.env.GREY_MODEL,
  };
}
