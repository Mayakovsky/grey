// ════════════════════════════════════════════
// SiteSpecificRegistry — Layer 3 of enhanced document resolution.
// Domain-specific handlers for known documentation platforms.
// Cheaper and more reliable than headless rendering for supported platforms.
// Zero dependencies — just HTTP fetch.
// ════════════════════════════════════════════

import type { ResolvedContent } from './types';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'SiteSpecificRegistry' });

type SiteHandler = (url: string) => Promise<ResolvedContent | null>;

const HANDLER_TIMEOUT_MS = 10000;

/**
 * Registry of domain-specific content resolvers.
 * Checked before headless browser — cheaper and more reliable
 * for known platforms.
 */
export class SiteSpecificRegistry {
  private handlers: Map<string, SiteHandler> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Check if a URL matches a registered handler and resolve content.
   */
  async resolve(url: string): Promise<ResolvedContent | null> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return null;
    }

    for (const [pattern, handler] of this.handlers) {
      // Exact match or subdomain match — NOT substring.
      // "notgitbook.io".endsWith(".gitbook.io") → false ✓
      // "docs.gitbook.io".endsWith(".gitbook.io") → true ✓
      if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        log.info('Site-specific handler matched', { hostname, pattern });
        try {
          return await handler(url);
        } catch {
          log.warn('Site-specific handler failed', { hostname, pattern });
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Register a handler for a domain pattern.
   * Pattern is matched against hostname via exact match or subdomain suffix.
   */
  register(domainPattern: string, handler: SiteHandler): void {
    this.handlers.set(domainPattern, handler);
  }

  private registerDefaults(): void {
    // GitBook: optimistic probe — sends Accept: text/markdown.
    // Many GitBook instances ignore this header and return HTML anyway.
    // The content-type and body checks catch that case; handler returns null
    // and pipeline falls through to Playwright. This is a cheap probe, not
    // a guaranteed resolver.
    this.register('gitbook.io', async (url: string) => {
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/markdown',
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
        },
        signal: AbortSignal.timeout(HANDLER_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!res.ok) return null;

      // Verify we actually got markdown back, not HTML
      const ct = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (text.length < 200) return null;
      if (ct.includes('text/html') && !text.trimStart().startsWith('#')) {
        return null;  // Server ignored Accept header, returned HTML
      }

      return {
        text,
        contentType: 'text/markdown',
        source: 'site-specific',
        resolvedUrl: url,
        diagnostics: [
          `SiteSpecificRegistry: GitBook markdown, ${text.length} chars`,
        ],
      };
    });

    // Notion: exported pages — requires Notion API integration
    // Placeholder for post-graduation implementation
    // this.register('notion.site', notionHandler);
    // this.register('notion.so', notionHandler);
  }
}
