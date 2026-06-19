// ════════════════════════════════════════════
// LlmsTxtResolver — Layer 2 of enhanced document resolution.
// Probes {origin}/llms-full.txt and /llms.txt for LLM-friendly markdown.
// Zero dependencies — just HTTP fetch.
// ════════════════════════════════════════════

import type { ResolvedContent } from './types';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'LlmsTxtResolver' });

const LLMS_TXT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

/**
 * llms-full.txt has inline content (useful for claim extraction).
 * llms.txt is often just an index of links (less useful without following links).
 * Use different minimum thresholds accordingly.
 */
const LLMS_PATHS = [
  { path: '/llms-full.txt', minChars: 200 },
  { path: '/llms.txt', minChars: 1000 },  // higher bar — index-only files are noise
] as const;

export class LlmsTxtResolver {
  /**
   * Probe the origin for llms-full.txt / llms.txt files.
   * Returns resolved content if found and substantive, null otherwise.
   */
  async resolve(originalUrl: string): Promise<ResolvedContent | null> {
    let origin: string;
    try {
      origin = new URL(originalUrl).origin;
    } catch {
      return null;
    }

    for (const { path, minChars } of LLMS_PATHS) {
      const llmsUrl = `${origin}${path}`;
      try {
        const res = await this.fetchWithRedirectLimit(llmsUrl);
        if (!res || !res.ok) continue;

        // Content-type guard: reject HTML error pages served as 200
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('text/html')) {
          log.debug('llms.txt returned HTML content-type, skipping', {
            url: llmsUrl,
            contentType: ct,
          });
          continue;
        }

        const text = await res.text();
        if (text.length < minChars) continue;

        // Secondary HTML guard: check for HTML document markers in body
        const trimmed = text.trimStart();
        if (
          trimmed.startsWith('<!DOCTYPE') ||
          trimmed.startsWith('<html') ||
          trimmed.startsWith('<HTML')
        ) {
          log.debug('llms.txt body contains HTML, skipping', { url: llmsUrl });
          continue;
        }

        log.info('llms.txt content found', {
          url: llmsUrl,
          chars: text.length,
          source: path,
        });

        return {
          text,
          contentType: 'text/markdown',
          source: 'llms-txt',
          resolvedUrl: llmsUrl,
          diagnostics: [
            `LlmsTxtResolver: ${text.length} chars from ${path}`,
          ],
        };
      } catch {
        log.debug('llms.txt probe failed', { url: llmsUrl });
        continue;
      }
    }

    log.debug('No llms.txt found', { origin });
    return null;
  }

  /**
   * Fetch with bounded redirect following (max 3 hops).
   * Consistent with the 3-redirect security policy.
   */
  private async fetchWithRedirectLimit(
    url: string,
  ): Promise<Response | null> {
    let currentUrl = url;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
          'Accept': 'text/plain, text/markdown, */*',
        },
        signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
        redirect: 'manual',
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      return res;
    }

    log.debug('llms.txt redirect limit exceeded', { url });
    return null;
  }
}
