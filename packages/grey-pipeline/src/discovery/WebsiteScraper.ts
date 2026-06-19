// ════════════════════════════════════════════
// Tier 2: WebsiteScraper
// Follow website URLs and scrape HTML for whitepaper/docs links.
// ════════════════════════════════════════════

import { WHITEPAPER_LINK_PATTERNS, DOCS_SITE_PATTERNS } from './constants';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'WebsiteScraper' });

export interface ScrapedLink {
  url: string;
  type: 'pdf' | 'docs_site' | 'whitepaper_page';
}

export class WebsiteScraper {
  constructor(private fetchFn: typeof fetch = fetch) {}

  /**
   * Given a list of website URLs, scrape each for whitepaper/docs links.
   * Returns the best candidate link found, or null.
   */
  async findWhitepaperLink(websiteUrls: string[]): Promise<ScrapedLink | null> {
    for (const url of websiteUrls) {
      try {
        const links = await this.scrapeUrl(url);
        if (links.length > 0) {
          // Prefer PDFs over docs sites over generic whitepaper pages
          const pdf = links.find((l) => l.type === 'pdf');
          if (pdf) return pdf;
          const docs = links.find((l) => l.type === 'docs_site');
          if (docs) return docs;
          return links[0];
        }
      } catch {
        // Skip failed URLs, try the next one
      }
    }
    return null;
  }

  /**
   * Fetch a URL's HTML and extract whitepaper-related links.
   */
  async scrapeUrl(url: string): Promise<ScrapedLink[]> {
    try {
      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': 'WhitepaperGrey/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return [];

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return [];

      const html = await response.text();
      return this.extractLinks(html, url);
    } catch (err) {
      log.warn('Failed to scrape URL', { url }, err);
      return [];
    }
  }

  /**
   * Extract whitepaper-related links from HTML content.
   */
  extractLinks(html: string, baseUrl: string): ScrapedLink[] {
    const links: ScrapedLink[] = [];
    const seen = new Set<string>();

    // Extract links matching whitepaper patterns
    for (const pattern of WHITEPAPER_LINK_PATTERNS) {
      // Reset regex state for global patterns
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        if (!href || seen.has(href)) continue;

        const resolved = this.resolveUrl(href, baseUrl);
        if (!resolved) continue;
        seen.add(resolved);

        if (resolved.toLowerCase().endsWith('.pdf')) {
          links.push({ url: resolved, type: 'pdf' });
        } else if (DOCS_SITE_PATTERNS.some((p) => p.test(resolved))) {
          links.push({ url: resolved, type: 'docs_site' });
        } else {
          links.push({ url: resolved, type: 'whitepaper_page' });
        }
      }
    }

    return links;
  }

  /**
   * Resolve a potentially relative URL against a base URL.
   */
  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return null;
    }
  }
}
