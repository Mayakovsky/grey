// grey-pipeline/discovery — public barrel + createDiscoveryStack factory (M3.5 §2.2).
// Assembles the tiered discovery tree exactly as plugin-wpv/src/WpvService.ts:184-212 does.
//
// Signature note (Pattern 1 Tier-B, internal-impl; progress-doc surfaced): the spec §2.2 sketched
// `createDiscoveryStack(deps: PipelineDeps, env)`, anticipating a deps→discovery translation. The
// verbatim-ported resolvers self-construct their loggers (module-level createLogger) and take no
// db/anthropic, so PipelineDeps is not threaded — the factory takes only `env`. Phase B's
// createHandlerDeps calls `createDiscoveryStack(env)` accordingly.

import { FetchContentResolver } from './FetchContentResolver';
import { CryptoContentResolver } from './CryptoContentResolver';
import { WebsiteScraper } from './WebsiteScraper';
import { WebSearchFallback } from './WebSearchFallback';
import { SyntheticWhitepaperComposer } from './SyntheticWhitepaperComposer';
import { GitHubResolver } from './GitHubResolver';
import { AggregatorResolver } from './AggregatorResolver';
import { TieredDocumentDiscovery } from './TieredDocumentDiscovery';

// ── Re-exports (discovery public surface) ──
export { resolveTokenName } from './resolveTokenName';
export {
  extractVersion,
  stripVersionSuffix,
  canonicalizeProjectName,
  normalizeGitHubUrl,
  KNOWN_PROTOCOL_NAMES,
} from './helpers';
export { FetchContentResolver } from './FetchContentResolver';
export { CryptoContentResolver } from './CryptoContentResolver';
export { WebsiteScraper } from './WebsiteScraper';
export { WebSearchFallback } from './WebSearchFallback';
export { SyntheticWhitepaperComposer } from './SyntheticWhitepaperComposer';
export { GitHubResolver } from './GitHubResolver';
export { AggregatorResolver } from './AggregatorResolver';
export { HeadlessBrowserResolver } from './HeadlessBrowserResolver';
export { LlmsTxtResolver } from './LlmsTxtResolver';
export { SiteSpecificRegistry } from './SiteSpecificRegistry';
export { TieredDocumentDiscovery } from './TieredDocumentDiscovery';
export type { TieredDocumentDiscoveryDeps } from './TieredDocumentDiscovery';
// NOTE: ResolvedContent is intentionally NOT re-exported here — the package barrel already
// surfaces it via `export * from '@grey/schemas'` (re-exporting it twice would TS2308-collide).
export type {
  ProjectMetadata,
  DocumentSource,
  ResolvedWhitepaper,
  TieredDiscoveryResult,
  IContentResolver,
} from './types';

/** Env-var-derived config for the discovery stack (githubToken / cmcApiKey). */
export interface DiscoveryEnv {
  githubToken?: string;
  cmcApiKey?: string;
}

/**
 * Build the tiered discovery stack. Mirrors WpvService.ts:184-212: FetchContentResolver →
 * CryptoContentResolver (which internally composes Llms-txt / site-specific / headless-browser /
 * docs-crawl); WebsiteScraper / WebSearchFallback / SyntheticWhitepaperComposer; GitHub + Aggregator
 * resolvers (Tier 3.5 / 3.75) threaded with env. Returns the top-level TieredDocumentDiscovery.
 */
export function createDiscoveryStack(env: DiscoveryEnv = {}): TieredDocumentDiscovery {
  const fetchResolver = new FetchContentResolver();
  const cryptoResolver = new CryptoContentResolver(fetchResolver);
  const websiteScraper = new WebsiteScraper();
  const webSearch = new WebSearchFallback();
  const composer = new SyntheticWhitepaperComposer();
  const githubResolver = new GitHubResolver(fetchResolver);
  const aggregatorResolver = new AggregatorResolver(fetchResolver);
  return new TieredDocumentDiscovery({
    resolver: cryptoResolver,
    websiteScraper,
    webSearch,
    composer,
    githubResolver,
    aggregatorResolver,
    env: { githubToken: env.githubToken, cmcApiKey: env.cmcApiKey },
  });
}
