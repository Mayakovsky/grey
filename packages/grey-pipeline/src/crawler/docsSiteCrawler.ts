// grey-pipeline — DocsSiteCrawler.
// Ported verbatim from plugin-wpv/src/discovery/DocsSiteCrawler.ts. ElizaOS-free
// (native fetch + regex HTML strip; no cheerio, no Playwright in core — the optional
// headlessResolver is injected). Only imports repointed (../types, ../logger).

import type { ResolvedContent } from '@grey/schemas';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'DocsSiteCrawler' });

// --- Configuration ---
const MAX_SUBPAGES = 8;
const SUBPAGE_TIMEOUT_MS = 8000;
const MAX_TOTAL_CHARS = 80000;
const MAX_CRAWL_TIME_MS = 45000;

/**
 * Crawls documentation sites by following internal links from a landing page.
 * Returns concatenated content from the landing page + scored sub-pages.
 */
export class DocsSiteCrawler {
  constructor(
    private headlessResolver?: {
      resolve: (url: string) => Promise<ResolvedContent | null>;
      resolveLinks: (url: string) => Promise<string[]>;
    } | null,
  ) {}

  /**
   * Detect whether a URL is a documentation site that would benefit from sub-page crawling.
   */
  static isDocsSite(url: string, textLength: number): boolean {
    // Text length between 200-10000 chars: enough to not be thin, but not a full whitepaper
    if (textLength < 200 || textLength > 10000) return false;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();

      // Hostname patterns
      if (hostname.startsWith('docs.')) return true;
      if (hostname.includes('gitbook.io')) return true;
      if (hostname.includes('readthedocs.io')) return true;
      if (hostname.includes('notion.site')) return true;

      // Path patterns
      if (pathname.startsWith('/docs/') || pathname.startsWith('/docs')) return true;
      if (pathname.startsWith('/documentation')) return true;
      if (pathname.startsWith('/wiki')) return true;

      return false;
    } catch {
      return false;
    }
  }

  /** Detect docs sites by URL pattern when text-based detection fails (SPA shells). */
  static isDocsSiteUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (hostname.startsWith('docs.')) return true;
      if (hostname.includes('gitbook.io')) return true;
      if (hostname.includes('readthedocs.io')) return true;
      if (hostname.includes('notion.site')) return true;
      if (pathname.startsWith('/docs/') || pathname === '/docs') return true;
      if (pathname.startsWith('/documentation')) return true;
      if (pathname.startsWith('/wiki')) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Crawl a documentation site starting from the landing page URL.
   * @param url - The landing page URL
   * @param landingPageText - Pre-stripped text from the resolver (included in output)
   */
  async crawl(
    url: string,
    landingPageText: string,
    signal?: AbortSignal,
  ): Promise<ResolvedContent | null> {
    const crawlStart = Date.now();

    try {
      // Fetch raw HTML for link extraction (separate from stripped text)
      const rawHtml = await this.fetchRawHtml(url);
      if (!rawHtml && !this.headlessResolver) return null;

      // Extract and score internal links
      const links = rawHtml ? this.extractLinks(rawHtml, url) : [];

      // SPA shell — no links in raw HTML. Use Playwright DOM extraction.
      if (links.length === 0 && this.headlessResolver) {
        log.info('No links in raw HTML — using Playwright DOM extraction', { url });
        const domLinks = await this.headlessResolver.resolveLinks(url);
        const origin = new URL(url).origin;
        const seen = new Set<string>([url.split('#')[0]]);
        for (const href of domLinks) {
          const canonical = href.split('#')[0];
          if (canonical.startsWith(origin) && !seen.has(canonical)) {
            seen.add(canonical);
            links.push(canonical);
          }
        }
        log.info('DOM link extraction complete', { url, linkCount: links.length });
      }

      const scoredLinks = links
        .map((href) => ({ href, score: this.scoreLink(href) }))
        .filter((l) => l.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SUBPAGES);

      if (scoredLinks.length === 0) {
        log.info('No high-value sub-page links found', { url, totalLinks: links.length });
        return null;
      }

      log.info('Crawling sub-pages', {
        url,
        totalLinks: links.length,
        scoredLinks: scoredLinks.length,
        topLink: scoredLinks[0].href.slice(0, 80),
      });

      // Fetch sub-pages — prepend landing page text
      const parts: string[] = [landingPageText];
      let totalChars = landingPageText.length;
      const visited = new Set<string>([url.split('#')[0]]);

      for (const { href } of scoredLinks) {
        if (signal?.aborted) break;
        if (totalChars >= MAX_TOTAL_CHARS) break;
        if (Date.now() - crawlStart > MAX_CRAWL_TIME_MS) {
          log.warn('Crawl wall time exceeded', { url, elapsed: Date.now() - crawlStart });
          break;
        }

        const canonical = href.split('#')[0];
        if (visited.has(canonical)) continue;
        visited.add(canonical);

        try {
          const subpageText = await this.fetchAndStrip(href);
          if (subpageText && subpageText.length > 100) {
            const sectionLabel = this.extractSectionLabel(href);
            parts.push(`\n\n--- [Section: ${sectionLabel}] ---\n\n${subpageText}`);
            totalChars += subpageText.length;
          }
        } catch {
          // Sub-page failed — skip, try next
        }
      }

      if (parts.length <= 1) {
        // Only the landing page — no sub-pages contributed
        return null;
      }

      const concatenated = parts.join('');

      log.info('Docs crawl complete', {
        url,
        subpagesFetched: parts.length - 1,
        totalChars: concatenated.length,
        elapsed: Date.now() - crawlStart,
      });

      return {
        text: concatenated.slice(0, MAX_TOTAL_CHARS),
        contentType: 'text/html',
        source: 'docs-crawl',
        resolvedUrl: url,
        diagnostics: [
          `DocsSiteCrawler: ${parts.length - 1} sub-pages crawled, ${concatenated.length} chars total`,
        ],
      };
    } catch (err) {
      log.warn('Docs crawl failed', { url, error: (err as Error).message });
      return null;
    }
  }

  // ── Private methods ──────────────────────────

  private async fetchRawHtml(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
        signal: AbortSignal.timeout(SUBPAGE_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) return null;
      const ct = response.headers.get('content-type') ?? '';
      if (ct.includes('application/pdf')) return null; // PDF, not a docs site
      return await response.text();
    } catch {
      return null;
    }
  }

  private async fetchAndStrip(url: string): Promise<string | null> {
    const html = await this.fetchRawHtml(url);
    if (html) {
      const stripped = this.stripHtml(html);
      if (stripped.length >= 200) return stripped;
    }
    // Plain HTTP returned thin/empty content — try Playwright if available
    if (this.headlessResolver) {
      try {
        const rendered = await this.headlessResolver.resolve(url);
        if (rendered && rendered.text.length >= 100) {
          log.info('Playwright fallback for sub-page', { url, chars: rendered.text.length });
          return rendered.text;
        }
      } catch {
        // Playwright failed — return whatever we got from HTTP
      }
    }
    return html ? this.stripHtml(html) : null;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#?\w+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract internal links from raw HTML.
   * v2 fix: uses full baseUrl (not just origin) for resolving relative links.
   */
  private extractLinks(html: string, baseUrl: string): string[] {
    const origin = new URL(baseUrl).origin;
    const linkPattern = /href=["']([^"']+)["']/gi;
    const links: string[] = [];
    const seen = new Set<string>();
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      try {
        const href = new URL(match[1], baseUrl).href;
        // Same-origin only
        if (!href.startsWith(origin)) continue;
        // Skip assets
        if (
          /\.(pdf|png|jpg|jpeg|gif|svg|css|js|json|xml|ico|woff|woff2|ttf|eot|mp4|mp3)(\?|$)/i.test(
            href,
          )
        )
          continue;
        // Skip anchors to same page (v2 fix: compare against baseUrl, not origin)
        const canonical = href.split('#')[0];
        if (canonical === baseUrl.split('#')[0]) continue;
        // Deduplicate by canonical URL (v2 fix: strip fragments before dedup)
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        links.push(canonical);
      } catch {
        continue;
      }
    }

    return links;
  }

  /**
   * Score a URL by likelihood of containing whitepaper/MiCA-relevant content.
   * Higher = more likely substantive. 0 = skip entirely.
   */
  private scoreLink(href: string): number {
    const lower = href.toLowerCase();
    let score = 0;

    // Skip non-content links
    const skip = [
      'changelog', 'release-notes', 'blog', 'news', 'faq', 'support',
      'contact', 'careers', 'jobs', 'login', 'signup', 'register',
      'api-reference', 'api/', 'sdk', 'npm', 'github.com', 'twitter.com',
      'discord', 'telegram', 'medium.com', 'migration',
    ];
    for (const kw of skip) {
      if (lower.includes(kw)) return 0;
    }

    // High-value: whitepaper structure + MiCA sections
    const highValue = [
      'whitepaper', 'overview', 'introduction', 'architecture',
      'tokenomics', 'mechanism', 'protocol', 'specification',
      'governance', 'risk', 'disclosure', 'legal', 'compliance',
      'redemption', 'reserve', 'environmental', 'rights',
      'audit', 'security', 'how-it-works', 'design', 'technical',
    ];
    for (const kw of highValue) {
      if (lower.includes(kw)) score += 3;
    }

    // Medium-value
    const medValue = ['docs', 'guide', 'reference', 'concept', 'staking', 'liquidity', 'smart-contract'];
    for (const kw of medValue) {
      if (lower.includes(kw)) score += 1;
    }

    // Prefer shallower paths (closer to root docs)
    try {
      const depth = (new URL(href).pathname.match(/\//g) || []).length;
      if (depth <= 3) score += 1;
    } catch {
      /* ignore */
    }

    return score;
  }

  private extractSectionLabel(href: string): string {
    try {
      const pathname = new URL(href).pathname;
      const segments = pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] ?? 'page';
      return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return 'page';
    }
  }
}
