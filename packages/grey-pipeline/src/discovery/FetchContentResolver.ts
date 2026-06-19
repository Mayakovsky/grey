// Minimal IContentResolver using fetch — for live L1 scans where
// plugin-autognostic's ContentResolver may not be available.
// Handles HTML pages. PDF support uses pdf-parse for proper text extraction.

import type { IContentResolver, ResolvedContent } from './types';

export class FetchContentResolver implements IContentResolver {
  private combineSignal(pipelineSignal?: AbortSignal): AbortSignal {
    const requestTimeout = AbortSignal.timeout(15000);
    return pipelineSignal ? AbortSignal.any([pipelineSignal, requestTimeout]) : requestTimeout;
  }

  async resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
        'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*',
      },
      signal: this.combineSignal(signal),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      // PDF is binary — re-fetch as ArrayBuffer and parse with pdf-parse
      try {
        const pdfResponse = await fetch(url, {
          headers: {
            'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
            'Accept': 'application/pdf,*/*',
          },
          signal: this.combineSignal(signal),
          redirect: 'follow',
        });
        const buffer = Buffer.from(await pdfResponse.arrayBuffer());
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(buffer);
        const pdfText = parsed.text?.trim() ?? '';
        if (pdfText.length > 100) {
          return {
            text: pdfText,
            contentType: 'application/pdf',
            source: 'pdf',
            resolvedUrl: url,
            pageCount: parsed.numpages,
            diagnostics: [`FetchContentResolver: pdf-parse extracted ${pdfText.length} chars, ${parsed.numpages} pages`],
          };
        }
      } catch {
        // pdf-parse failed — fall through to raw text
      }
      // Fallback: return raw text (may be garbled for binary PDFs)
      return {
        text: body.length > 100 ? body : '',
        contentType: 'application/pdf',
        source: 'pdf',
        resolvedUrl: url,
        diagnostics: ['FetchContentResolver: pdf-parse failed, raw text fallback'],
      };
    }

    // HTML — strip tags for plain text
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#?\w+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // SPA detection: if HTML yielded very little text but contained
    // script tags AND a known JS framework marker, it's likely a
    // client-rendered SPA. Signal this in diagnostics for CryptoContentResolver.
    const SPA_TEXT_THRESHOLD = 500;
    const SPA_FRAMEWORK_MARKERS = [
      '__NEXT_DATA__',       // Next.js
      'id="__nuxt"',         // Nuxt.js
      'id="root"',           // React (Create React App)
      'id="app"',            // Vue.js
      'data-reactroot',      // React
      'ng-version',          // Angular
      'data-svelte',         // Svelte/SvelteKit
      '__GATSBY',            // Gatsby
    ];

    const diagnostics = ['FetchContentResolver: HTML text extraction'];

    if (text.length < SPA_TEXT_THRESHOLD) {
      const hasScriptTags = body.includes('<script');
      const hasFrameworkMarker = SPA_FRAMEWORK_MARKERS.some(
        (marker) => body.includes(marker),
      );
      if (hasScriptTags && hasFrameworkMarker) {
        diagnostics.push('SPA_DETECTED');
      }
    }

    // Redirect-to-homepage detection: original URL had a meaningful path
    // (e.g., /whitepaper) but we landed on root (/) after redirects.
    // The content is a homepage, not a document.
    try {
      const origPath = new URL(url).pathname;
      const finalUrl = response.url;
      const finalPath = new URL(finalUrl).pathname;
      const ROOT_PATHS = ['/', '/en', '/en/', ''];
      if (origPath.length > 3 && !ROOT_PATHS.includes(origPath) && ROOT_PATHS.includes(finalPath) && finalUrl !== url) {
        diagnostics.push('REDIRECT_TO_HOMEPAGE');
      }
    } catch { /* URL parse failure — skip check */ }

    return {
      text,
      contentType: contentType || 'text/html',
      source: 'html',
      resolvedUrl: response.url,
      diagnostics,
    };
  }
}
