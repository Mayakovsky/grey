// grey-pipeline — CryptoContentResolver happy-path unit test (M3.5 Phase A, FDQ-7b).
// The rest of the discovery tree is unit-test-deferred (parity-diff + smoke cover integration);
// this asserts the direct-fetch happy path: a substantive PDF resolves straight through Layer 1
// (no enhanced/headless/docs-crawl) to a ResolvedWhitepaper carrying the fetched text.
import { describe, it, expect, vi } from 'vitest';
import { CryptoContentResolver } from '../src/discovery/CryptoContentResolver';
import type { IContentResolver, ResolvedContent } from '../src/discovery/types';

const longPdfText = 'Tokenomics and protocol architecture. '.repeat(200); // ~7.6k chars, well over threshold

function fakeResolver(content: Partial<ResolvedContent>): IContentResolver {
  return {
    resolve: vi.fn(
      async (url: string): Promise<ResolvedContent> => ({
        text: '',
        contentType: 'application/pdf',
        source: 'fetch',
        resolvedUrl: url,
        pageCount: 0,
        diagnostics: [],
        ...content,
      }),
    ),
  };
}

describe('CryptoContentResolver.resolveWhitepaper — direct-fetch happy path', () => {
  it('returns the fetched PDF text via the direct Layer-1 path (no enhanced resolution)', async () => {
    const resolver = fakeResolver({ text: longPdfText, pageCount: 5 });
    const crypto = new CryptoContentResolver(resolver);

    const result = await crypto.resolveWhitepaper('https://example.org/whitepaper.pdf');

    expect(result.text).toBe(longPdfText);
    expect(result.source).toBe('direct');
    expect(result.pageCount).toBe(5);
    expect(result.isImageOnly).toBe(false);
    expect(result.originalUrl).toBe('https://example.org/whitepaper.pdf');
    // direct hit ⇒ the injected resolver was consulted exactly once (no headless/docs-crawl fallback)
    expect((resolver.resolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
