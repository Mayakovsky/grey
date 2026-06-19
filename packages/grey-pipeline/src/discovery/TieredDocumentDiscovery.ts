// ════════════════════════════════════════════
// TieredDocumentDiscovery
// Orchestrator for multi-tier whitepaper discovery.
// Tier 1: ACP description (PDF/IPFS links)
// Tier 2: Website scraping (follow project URLs)
// Tier 3: Web search fallback
// Tier 4: Composed whitepaper from Virtuals page
// ════════════════════════════════════════════

import type { ProjectMetadata, TieredDiscoveryResult, DocumentSource } from './types';
import type { CryptoContentResolver } from './CryptoContentResolver';
import type { WebsiteScraper } from './WebsiteScraper';
import type { WebSearchFallback } from './WebSearchFallback';
import type { SyntheticWhitepaperComposer } from './SyntheticWhitepaperComposer';
import type { GitHubResolver } from './GitHubResolver';
import type { AggregatorResolver } from './AggregatorResolver';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'TieredDocumentDiscovery' });

export interface TieredDocumentDiscoveryDeps {
  resolver: CryptoContentResolver;
  websiteScraper: WebsiteScraper;
  webSearch: WebSearchFallback;
  composer: SyntheticWhitepaperComposer;
  /** Phase 3 additions — Tier 3.5 / 3.75 */
  githubResolver?: GitHubResolver;
  aggregatorResolver?: AggregatorResolver;
  env?: { githubToken?: string; cmcApiKey?: string };
}

/** First-N-chars window used to verify a discovered document actually references the project */
const SANITY_CHECK_CHARS = 2000;

function verifyRelevance(text: string, projectName: string, tokenAddress?: string): boolean {
  const hay = text.slice(0, SANITY_CHECK_CHARS).toLowerCase();
  if (projectName && hay.includes(projectName.toLowerCase())) return true;
  if (tokenAddress && hay.includes(tokenAddress.toLowerCase())) return true;
  return false;
}

export class TieredDocumentDiscovery {
  constructor(private deps: TieredDocumentDiscoveryDeps) {}

  /**
   * Discover and resolve a whitepaper through 4 tiers of fallback.
   * Returns null only if all tiers fail completely.
   */
  async discover(
    metadata: ProjectMetadata,
    tokenAddress: string,
  ): Promise<TieredDiscoveryResult | null> {
    const projectName = metadata.agentName ?? tokenAddress;

    // ── Tier 1: ACP description — PDF/IPFS links ──
    const pdfUrl = metadata.linkedUrls.find(
      (u) => u.endsWith('.pdf') || u.includes('ipfs'),
    );
    if (pdfUrl) {
      try {
        const resolved = await this.deps.resolver.resolveWhitepaper(pdfUrl);
        if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
          const source: DocumentSource = resolved.source === 'ipfs' ? 'ipfs' : 'pdf';
          log.info('Tier 1: PDF/IPFS from ACP description', { projectName, url: pdfUrl });
          return { resolved, documentUrl: pdfUrl, documentSource: source, tier: 1 };
        }
      } catch {
        // Fall through to Tier 2
      }
    }

    // ── Tier 2: Website scraping ──
    const websiteUrls = metadata.linkedUrls.filter(
      (u) => !u.endsWith('.pdf') && !u.includes('ipfs'),
    );
    if (websiteUrls.length > 0) {
      try {
        const scraped = await this.deps.websiteScraper.findWhitepaperLink(websiteUrls);
        if (scraped) {
          const resolved = await this.deps.resolver.resolveWhitepaper(scraped.url);
          if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
            const source: DocumentSource = scraped.type === 'pdf' ? 'pdf' : 'docs_site';
            log.info('Tier 2: Found via website scraping', { projectName, url: scraped.url, type: scraped.type });
            return { resolved, documentUrl: scraped.url, documentSource: source, tier: 2 };
          }
        }
      } catch {
        // Fall through to Tier 3
      }
    }

    // ── Tier 3.5: GitHub whitepaper search (Phase 3) ──
    // Runs BEFORE the old web-search tier so we try the richest sources first.
    if (this.deps.githubResolver) {
      try {
        const gh = await this.deps.githubResolver.resolve({
          projectName,
          tokenAddress,
          token: this.deps.env?.githubToken,
        });
        if (gh && gh.text.length > 100 && verifyRelevance(gh.text, projectName, tokenAddress)) {
          log.info('Tier 3.5: Found via GitHub search', { projectName, repo: gh.repoFullName });
          return {
            resolved: {
              text: gh.text,
              pageCount: gh.pageCount,
              isImageOnly: false,
              isPasswordProtected: false,
              source: 'direct',
              originalUrl: gh.sourceUrl,
              resolvedUrl: gh.sourceUrl,
            },
            documentUrl: gh.sourceUrl,
            documentSource: 'pdf',
            tier: 3,
          };
        }
      } catch (err) {
        log.debug('Tier 3.5: GitHub resolver threw', { error: (err as Error).message });
      }
    }

    // ── Tier 3.75: Aggregator APIs (CoinGecko / CMC) ──
    if (this.deps.aggregatorResolver) {
      try {
        const agg = await this.deps.aggregatorResolver.resolve({
          projectName,
          tokenAddress,
          cmcApiKey: this.deps.env?.cmcApiKey,
        });
        if (agg && agg.text.length > 100 && verifyRelevance(agg.text, projectName, tokenAddress)) {
          log.info('Tier 3.75: Found via aggregator', { projectName, aggregator: agg.aggregator });
          return {
            resolved: {
              text: agg.text,
              pageCount: agg.pageCount,
              isImageOnly: false,
              isPasswordProtected: false,
              source: 'direct',
              originalUrl: agg.sourceUrl,
              resolvedUrl: agg.sourceUrl,
            },
            documentUrl: agg.sourceUrl,
            documentSource: 'pdf',
            tier: 3,
          };
        }
      } catch (err) {
        log.debug('Tier 3.75: Aggregator resolver threw', { error: (err as Error).message });
      }
    }

    // ── Tier 3 (legacy fallback): Web search with known-URL map ──
    // Kept as a last-resort before synthetic composition — the known-URL map
    // sometimes points to sparse pages, so we prefer GitHub + aggregators above.
    try {
      const searchUrl = await this.deps.webSearch.searchWhitepaper(projectName);
      if (searchUrl) {
        const resolved = await this.deps.resolver.resolveWhitepaper(searchUrl);
        if (resolved.text.length > 100 && !resolved.isImageOnly && !resolved.isPasswordProtected) {
          log.info('Tier 3 (web search fallback): Found via known-URL map', { projectName, url: searchUrl });
          return { resolved, documentUrl: searchUrl, documentSource: 'pdf', tier: 3 };
        }
      }
    } catch {
      // Fall through to Tier 4
    }

    // ── Tier 4: Composed whitepaper from Virtuals + metadata ──
    try {
      const composed = await this.deps.composer.compose(tokenAddress, metadata);
      if (composed.text.length > 50) {
        log.info('Tier 4: Composed whitepaper from available data', { projectName });
        return {
          resolved: composed,
          documentUrl: composed.originalUrl,
          documentSource: 'composed',
          tier: 4,
        };
      }
    } catch (err) {
      log.warn('Tier 4: Composition failed', { projectName }, err);
    }

    log.warn('All discovery tiers failed', { projectName, tokenAddress });
    return null;
  }
}
