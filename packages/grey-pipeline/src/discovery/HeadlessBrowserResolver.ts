// ════════════════════════════════════════════
// HeadlessBrowserResolver — Layer 4 of enhanced document resolution.
// Renders JavaScript SPAs via Playwright headless Chromium.
// SOFT dependency — if playwright-core is not installed, returns null.
//
// Security note: --no-sandbox + --single-process removes process isolation.
// Acceptable for Grey's use case (controlled URLs from ACP buyers, not
// arbitrary browsing). Do NOT use this pattern for general-purpose crawling.
// ════════════════════════════════════════════

import type { ResolvedContent } from './types';
import { createLogger } from '../logger';
import * as os from 'os';

const log = createLogger({ operation: 'HeadlessBrowserResolver' });

// --- Configuration ---
const PAGE_LOAD_TIMEOUT_MS = 15000;
const POST_RENDER_WAIT_MS = 3000;
const MAX_CONTENT_LENGTH = 100000;
const BROWSER_RESTART_THRESHOLD = 20;
const MAX_REDIRECTS = 3;
const RATE_LIMIT_PER_HOUR = 30;
const MIN_FREE_RAM_BYTES = 200 * 1024 * 1024; // 200MB — Playwright uses ~150MB, 50MB buffer
const CONTEXT_CLOSE_TIMEOUT_MS = 5000;
const THIN_SPA_THRESHOLD = 2000;
const MAX_SUBPAGES = 5;
const SUBPAGE_TIMEOUT_MS = 10000;
const MAX_DEEP_CONTENT_CHARS = 50000;

// Resource types to block — Grey is text-only, no visual awareness.
// If Grey ever gains visual awareness (OCR, vision model), revisit this.
const BLOCKED_RESOURCE_TYPES = new Set([
  'image',
  'font',
  'media',
  'stylesheet',
  'other',
]);

interface RateLimitState {
  timestamps: number[];
}

export class HeadlessBrowserResolver {
  private browser: unknown | null = null;
  private chromium: unknown | null = null;
  private pageCount = 0;
  private rateLimit: RateLimitState = { timestamps: [] };
  private available = false;
  private initPromise: Promise<void> | null = null;
  private _renderLock: Promise<void> = Promise.resolve();
  private _lastResolveFollowedLinks = false;

  constructor() {
    // Lazy dynamic import — deferred to first use via ensureBrowser().
    // Cannot use require() in ESM context.
  }

  async resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent | null> {
    if (signal?.aborted) return null;
    let release: () => void;
    const acquired = new Promise<void>(r => { release = r; });
    const previous = this._renderLock;
    this._renderLock = acquired;
    await previous;
    // Check again after lock wait — pipeline may have timed out while queued
    if (signal?.aborted) { release!(); return null; }
    try {
      return await this._resolveImpl(url, signal);
    } finally {
      release!();
    }
  }

  private async _resolveImpl(url: string, signal?: AbortSignal): Promise<ResolvedContent | null> {
    // Lazy init: attempt to load playwright-core on first call
    if (!this.initPromise && !this.available && !this.chromium) {
      this.initPromise = this.loadPlaywright();
      await this.initPromise;
    }

    if (!this.available) return null;

    // Rate limit check
    if (this.isRateLimited()) {
      log.warn('SPA rate limit reached', { limit: RATE_LIMIT_PER_HOUR });
      return null;
    }

    // Memory guard — refuse to launch if RAM is tight
    const freeRam = os.freemem();
    if (freeRam < MIN_FREE_RAM_BYTES) {
      log.warn('Insufficient free RAM for headless browser', {
        freeRamMB: Math.round(freeRam / 1024 / 1024),
        requiredMB: Math.round(MIN_FREE_RAM_BYTES / 1024 / 1024),
      });
      return null;
    }

    try {
      if (signal?.aborted) return null;
      await this.ensureBrowser();
      this._lastResolveFollowedLinks = false;
      const text = await this.renderAndExtract(url);

      if (!text || text.length < 100) {
        log.info('Headless render produced insufficient text', {
          url,
          chars: text?.length ?? 0,
        });
        return null;
      }

      this.recordRateLimitHit();

      const diagnostics = [
        `HeadlessBrowserResolver: rendered SPA, ${text.length} chars extracted`,
      ];
      if (this._lastResolveFollowedLinks) {
        diagnostics.push('LINKS_FOLLOWED');
      }

      return {
        text: text.slice(0, MAX_CONTENT_LENGTH),
        contentType: 'text/html',
        source: 'headless-browser',
        resolvedUrl: url,
        diagnostics,
      };
    } catch {
      log.warn('Headless browser render failed', { url });
      return null;
    }
  }

  /**
   * Render a page and extract internal <a href> links from the DOM.
   * Used by DocsSiteCrawler when raw HTML has no links (SPA shell).
   * Acquires the same render lock as resolve().
   */
  async resolveLinks(url: string): Promise<string[]> {
    let release: () => void;
    const acquired = new Promise<void>(r => { release = r; });
    const previous = this._renderLock;
    this._renderLock = acquired;
    await previous;
    try {
      return await this._resolveLinksImpl(url);
    } finally {
      release!();
    }
  }

  private async _resolveLinksImpl(url: string): Promise<string[]> {
    if (!this.initPromise && !this.available && !this.chromium) {
      this.initPromise = this.loadPlaywright();
      await this.initPromise;
    }
    if (!this.available) return [];
    if (this.isRateLimited()) return [];

    const freeRam = os.freemem();
    if (freeRam < MIN_FREE_RAM_BYTES) return [];

    try {
      await this.ensureBrowser();
      const browser = this.browser as { newContext: (opts: unknown) => Promise<unknown> };
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        javaScriptEnabled: true,
      }) as { newPage: () => Promise<unknown>; close: () => Promise<void> };

      const page = await context.newPage() as {
        route: (pattern: string, handler: (route: unknown) => void) => Promise<void>;
        goto: (url: string, opts: unknown) => Promise<void>;
        evaluate: <T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
      };

      try {
        await page.route('**/*', (route: unknown) => {
          const r = route as { request: () => { resourceType: () => string }; abort: () => Promise<void>; continue: () => Promise<void> };
          if (BLOCKED_RESOURCE_TYPES.has(r.request().resourceType())) return r.abort();
          return r.continue();
        });

        await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_LOAD_TIMEOUT_MS });
        const origin = new URL(url).origin;

        const links: string[] = await page.evaluate((originStr) => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return anchors
            .map((a) => {
              try {
                const href = (a as HTMLAnchorElement).href;
                if (href.startsWith(originStr as string)) return href;
                return null;
              } catch { return null; }
            })
            .filter((href): href is string => href !== null)
            .filter((href, i, arr) => arr.indexOf(href) === i);
        }, origin);

        this.recordRateLimitHit();
        this.pageCount++;

        log.info('resolveLinks completed', { url, linkCount: links.length });
        return links;
      } finally {
        await Promise.race([
          context.close(),
          new Promise<void>((resolve) => setTimeout(resolve, CONTEXT_CLOSE_TIMEOUT_MS)),
        ]);
      }
    } catch (err) {
      log.warn('resolveLinks failed', { url, error: (err as Error).message });
      return [];
    }
  }

  private async loadPlaywright(): Promise<void> {
    try {
      // soft dependency — playwright-core is declared but browser binaries are optional
      const pw = await import('playwright-core');
      this.chromium = (pw as Record<string, unknown>).chromium ?? (pw.default as Record<string, unknown>)?.chromium;
      if (this.chromium) {
        this.available = true;
        log.info('Playwright loaded successfully');
      } else {
        log.warn('Playwright module found but chromium export missing');
      }
    } catch {
      this.available = false;
      log.warn(
        'Playwright not installed — HeadlessBrowserResolver disabled. ' +
        'Install with: bun add playwright-core && npx playwright install chromium',
      );
    }
  }

  private async renderAndExtract(url: string): Promise<string | null> {
    const browser = this.browser as { newContext: (opts: unknown) => Promise<unknown> };
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
    }) as { newPage: () => Promise<unknown>; close: () => Promise<void> };

    const page = await context.newPage() as {
      route: (pattern: string, handler: (route: unknown) => void) => Promise<void>;
      on: (event: string, handler: (arg: unknown) => void) => void;
      goto: (url: string, opts: unknown) => Promise<void>;
      url: () => string;
      evaluate: <T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
      waitForFunction: (fn: string | (() => boolean), opts?: unknown) => Promise<void>;
    };
    let navigationRedirectCount = 0;

    try {
      // Block unnecessary resource types — Grey is text-only
      await page.route('**/*', (route: unknown) => {
        const r = route as { request: () => { resourceType: () => string }; abort: () => Promise<void>; continue: () => Promise<void> };
        const resourceType = r.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
          return r.abort();
        }
        return r.continue();
      });

      // Track NAVIGATION redirects only (not subresource redirects like CDN 3xx).
      page.on('request', (request: unknown) => {
        const req = request as { isNavigationRequest: () => boolean; redirectedFrom: () => unknown | null };
        if (req.isNavigationRequest() && req.redirectedFrom()) {
          navigationRedirectCount++;
        }
      });

      // Navigate and wait for content to render
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: PAGE_LOAD_TIMEOUT_MS,
      });

      // Abort if navigation redirect limit was exceeded
      if (navigationRedirectCount > MAX_REDIRECTS) {
        log.warn('Navigation redirect limit exceeded', {
          url,
          navigationRedirectCount,
          maxRedirects: MAX_REDIRECTS,
        });
        return null;
      }

      // Validate final URL domain
      const finalUrl = page.url();
      if (!this.isDomainTrusted(url, finalUrl)) {
        log.warn('Redirect to untrusted domain', {
          originalUrl: url,
          finalUrl,
        });
        return null;
      }

      // Targeted text extraction with fallback
      let text = await page.evaluate(() => {
        const selectors = [
          'main',
          'article',
          '.content',
          '.whitepaper',
          '#content',
          '[role="main"]',
          '.documentation',
          '.docs-content',
          '.markdown-body',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).innerText.length > 200) {
            return (el as HTMLElement).innerText;
          }
        }
        return document.body.innerText;
      });

      // If targeted extraction got minimal text, wait for hydration and retry.
      // Fix #5: Use waitForFunction instead of deprecated waitForTimeout.
      if (!text || text.length < 200) {
        try {
          await page.waitForFunction(
            () => document.body.innerText.length > 200,
            { timeout: POST_RENDER_WAIT_MS },
          );
        } catch {
          // Timeout — page didn't hydrate in time, use what we have
        }
        const retryText = await page.evaluate(
          () => document.body.innerText,
        );
        if (!retryText || retryText.length < 100) return retryText || null;
        if (retryText.length >= THIN_SPA_THRESHOLD) return retryText;
        // Hydration produced 100-1999 chars — propagate to link-following check below
        text = retryText;
      }

      // SPA link-following: if content is thin (likely index/nav page),
      // follow internal links to find substantive documentation.
      const contentForCheck = text ?? '';
      if (contentForCheck.length >= 100 && contentForCheck.length < THIN_SPA_THRESHOLD) {
        log.info('Thin SPA content — attempting link following', {
          url,
          chars: contentForCheck.length,
        });
        const deepContent = await this.followInternalLinks(page, url);
        if (deepContent && deepContent.length > contentForCheck.length) {
          this._lastResolveFollowedLinks = true;
          return deepContent;
        }
      }

      return text;
    } finally {
      this.pageCount++;
      // Fix #4: Timeout on context.close() to prevent hanging on bad browser state
      await Promise.race([
        context.close(),
        new Promise<void>((resolve) => setTimeout(resolve, CONTEXT_CLOSE_TIMEOUT_MS)),
      ]);
    }
  }

  /**
   * Validate that the final URL after redirects is related to the original.
   * Allows: same domain/subdomain, known CDNs, known doc hosts.
   */
  private isDomainTrusted(originalUrl: string, finalUrl: string): boolean {
    try {
      const originalHost = new URL(originalUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;

      // Same domain or subdomain relationship
      if (
        finalHost === originalHost ||
        finalHost.endsWith('.' + originalHost) ||
        originalHost.endsWith('.' + finalHost)
      ) {
        return true;
      }

      // Known trusted hosts for documentation and content
      const trustedHosts = [
        'github.com',
        'raw.githubusercontent.com',
        'gitbook.io',
        'notion.site',
        'notion.so',
        'ipfs.io',
        'cloudflare-ipfs.com',
        'arweave.net',
        'docs.google.com',
        'cdn.jsdelivr.net',
        'cloudflare.com',
        'amazonaws.com',
      ];

      return trustedHosts.some(
        (host) => finalHost === host || finalHost.endsWith('.' + host),
      );
    } catch {
      return false;
    }
  }

  /**
   * Follow internal links from a thin SPA page to find substantive content.
   * Scores links by relevance, follows top candidates, concatenates results.
   */
  private async followInternalLinks(
    page: { goto: (url: string, opts: unknown) => Promise<void>; evaluate: <T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown) => Promise<T> },
    originalUrl: string,
  ): Promise<string | null> {
    const origin = new URL(originalUrl).origin;

    // Extract internal links from the rendered page
    const links: string[] = await page.evaluate((originStr) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map((a) => {
          try {
            const href = (a as HTMLAnchorElement).href;
            if (href.startsWith(originStr as string)) return href;
            return null;
          } catch { return null; }
        })
        .filter((href): href is string => href !== null)
        .filter((href, i, arr) => arr.indexOf(href) === i);
    }, origin);

    if (links.length === 0) return null;

    // Score and rank by content relevance
    const scoredLinks = links
      .map((href) => ({ href, score: this.scoreLink(href) }))
      .filter((l) => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUBPAGES);

    if (scoredLinks.length === 0) return null;

    const contentParts: string[] = [];
    let totalChars = 0;

    for (const { href } of scoredLinks) {
      if (totalChars >= MAX_DEEP_CONTENT_CHARS) break;

      try {
        await page.goto(href, {
          waitUntil: 'networkidle',
          timeout: SUBPAGE_TIMEOUT_MS,
        });

        const subpageText = await page.evaluate(() => {
          const selectors = [
            'main', 'article', '.content', '#content',
            '[role="main"]', '.documentation', '.docs-content',
            '.markdown-body',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && (el as HTMLElement).innerText.length > 200) {
              return (el as HTMLElement).innerText;
            }
          }
          return document.body.innerText;
        });

        if (subpageText && subpageText.length > 200) {
          contentParts.push(subpageText);
          totalChars += subpageText.length;
          this.pageCount++;
        }
      } catch {
        // Subpage failed — skip, try next
      }
    }

    if (contentParts.length === 0) return null;

    log.info('Link following completed', {
      originalUrl,
      pagesFollowed: contentParts.length,
      totalChars,
    });

    return contentParts.join('\n\n---\n\n');
  }

  /**
   * Score a URL by likelihood of containing whitepaper/protocol content.
   * Higher = more likely substantive. 0 = skip entirely.
   */
  private scoreLink(href: string): number {
    const lower = href.toLowerCase();
    let score = 0;

    // Skip non-content links
    const negative = [
      'changelog', 'release-notes', 'blog', 'news',
      'faq', 'support', 'contact', 'careers', 'jobs',
      'login', 'signup', 'register', 'api-reference',
      'sdk', 'npm', 'github.com', 'twitter.com',
      'discord', 'telegram', 'medium.com',
    ];
    for (const kw of negative) {
      if (lower.includes(kw)) return 0;
    }

    // High-value content signals
    const highValue = [
      'whitepaper', 'protocol', 'overview', 'introduction',
      'architecture', 'technical', 'specification', 'tokenomics',
      'mechanism', 'design', 'how-it-works', 'concept',
    ];
    for (const kw of highValue) {
      if (lower.includes(kw)) score += 3;
    }

    // Medium-value signals
    const medValue = ['docs', 'documentation', 'guide', 'reference', 'governance', 'security'];
    for (const kw of medValue) {
      if (lower.includes(kw)) score += 1;
    }

    // Prefer shorter paths (closer to root docs)
    try {
      const pathDepth = (new URL(href).pathname.match(/\//g) || []).length;
      if (pathDepth <= 2) score += 1;
    } catch { /* ignore */ }

    return score;
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser && this.pageCount < BROWSER_RESTART_THRESHOLD) {
      return;
    }

    if (this.browser) {
      log.info('Recycling browser', {
        pageCount: this.pageCount,
        threshold: BROWSER_RESTART_THRESHOLD,
      });
      await this.close();
    }

    const chromium = this.chromium as { launch: (opts: unknown) => Promise<unknown> };
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
    });
    this.pageCount = 0;
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    this.rateLimit.timestamps = this.rateLimit.timestamps.filter(
      (t) => t > oneHourAgo,
    );
    return this.rateLimit.timestamps.length >= RATE_LIMIT_PER_HOUR;
  }

  private recordRateLimitHit(): void {
    this.rateLimit.timestamps.push(Date.now());
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        const b = this.browser as { close: () => Promise<void> };
        await b.close();
      } catch {
        // Browser may have already crashed
      }
      this.browser = null;
      this.pageCount = 0;
    }
  }
}
