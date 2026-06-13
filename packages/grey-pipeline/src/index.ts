// @grey/pipeline — public API.
// Verification pipeline extracted from plugin-wpv (Movement 1 Step 2).

// Domain types + enums
export * from '@grey/schemas';

// Stage functions (FWD-4) + composition
export * from './pipeline';

// Dependency container
export * from './deps';

// Service clients + infra
export { createAnthropicClient } from './clients/anthropic';
export type { AnthropicClient } from './clients/anthropic';
export { createDb } from './persistence/client';
export type { GreyDb } from './persistence/client';
export { CostTracker } from './telemetry/costTracker';
export type {
  PipelineStage,
  TriggerSource,
  StageUsage,
  VerificationMetrics,
} from './telemetry/costTracker';
export { createLogger } from './logger';
export type { Logger } from './logger';

// Stage classes (also individually usable)
export { StructuralAnalyzer } from './structural/structuralAnalyzer';
export type { SectionDetector, PaperDetector } from './structural/structuralAnalyzer';
export { ClaimExtractor } from './extraction/claimExtractor';
export { ClaimEvaluator } from './evaluation/claimEvaluator';
export type { SemanticScholarClient } from './evaluation/claimEvaluator';
export { ScoreAggregator } from './synthesis/scoreAggregator';
export { ReportGenerator } from './synthesis/reportGenerator';
export type { DiscoveryProvenance } from './synthesis/reportGenerator';
export { DocsSiteCrawler } from './crawler/docsSiteCrawler';

// Persistence schema + repositories
export * as schema from './persistence/schema';
export {
  WhitepapersRepo,
  ClaimsRepo,
  VerificationsRepo,
  RequestsRepo,
  CostEventsRepo,
} from './persistence/repositories';

// Constants worth exposing
export { GREY_MODEL, LLM_PRICING, DEFAULT_SCORE_WEIGHTS } from './constants';
