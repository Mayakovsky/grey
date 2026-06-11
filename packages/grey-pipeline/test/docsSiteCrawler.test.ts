import { describe, it, expect } from 'vitest';
import { DocsSiteCrawler } from '../src/crawler/docsSiteCrawler';

describe('DocsSiteCrawler static detection', () => {
  it('isDocsSiteUrl detects docs hostnames and paths', () => {
    expect(DocsSiteCrawler.isDocsSiteUrl('https://docs.example.com/intro')).toBe(true);
    expect(DocsSiteCrawler.isDocsSiteUrl('https://x.gitbook.io/y')).toBe(true);
    expect(DocsSiteCrawler.isDocsSiteUrl('https://example.com/documentation')).toBe(true);
    expect(DocsSiteCrawler.isDocsSiteUrl('https://example.com/whitepaper.pdf')).toBe(false);
  });

  it('isDocsSite respects the text-length window', () => {
    expect(DocsSiteCrawler.isDocsSite('https://docs.foo.com', 50)).toBe(false); // too thin
    expect(DocsSiteCrawler.isDocsSite('https://docs.foo.com', 500)).toBe(true);
    expect(DocsSiteCrawler.isDocsSite('https://docs.foo.com', 50000)).toBe(false); // too long
    expect(DocsSiteCrawler.isDocsSite('https://example.com/', 500)).toBe(false); // not a docs site
  });
});
