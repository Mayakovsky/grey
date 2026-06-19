// ════════════════════════════════════════════
// Tier 4: SyntheticWhitepaperComposer
// When no standalone whitepaper exists, compose one from Virtuals page data.
// ════════════════════════════════════════════

import type { ProjectMetadata, ResolvedWhitepaper } from './types';
import { VIRTUALS_PAGE_URL } from './constants';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'SyntheticWhitepaperComposer' });

export class SyntheticWhitepaperComposer {
  constructor(private fetchFn: typeof fetch = fetch) {}

  /**
   * Compose a synthetic whitepaper from Virtuals page data + ACP metadata.
   */
  async compose(
    tokenAddress: string,
    metadata: ProjectMetadata,
  ): Promise<ResolvedWhitepaper> {
    const projectName = metadata.agentName ?? tokenAddress;
    const pageUrl = `${VIRTUALS_PAGE_URL}${tokenAddress}`;

    // Try to fetch Virtuals page for additional data
    let virtualsPageText = '';
    try {
      virtualsPageText = await this.fetchVirtualsPage(pageUrl);
    } catch {
      log.warn('Could not fetch Virtuals page, composing from metadata only', { tokenAddress });
    }

    const sections: string[] = [];

    // Header
    sections.push(`# Composed Whitepaper — ${projectName}`);
    sections.push(`> No standalone whitepaper found. Composed by Grey from available data on ${new Date().toISOString().split('T')[0]}.`);
    sections.push(`> Source: Virtuals Protocol page + ACP metadata`);
    sections.push('');

    // Project Overview
    sections.push('## Project Overview');
    sections.push(metadata.description ?? 'No description available.');
    sections.push('');

    if (metadata.category) {
      sections.push(`**Category:** ${metadata.category}`);
      sections.push('');
    }

    // Token Information
    sections.push('## Token Information');
    sections.push(`**Token Address:** ${tokenAddress}`);
    sections.push(`**Chain:** Base`);
    if (metadata.graduationStatus) {
      sections.push(`**Graduation Status:** ${metadata.graduationStatus}`);
    }
    sections.push('');

    // Virtuals page data (if available)
    if (virtualsPageText) {
      const extracted = this.extractVirtualsData(virtualsPageText);
      if (extracted.tokenomics) {
        sections.push('## Tokenomics');
        sections.push(extracted.tokenomics);
        sections.push('');
      }
      if (extracted.description && !metadata.description) {
        sections.push('## Description (from Virtuals)');
        sections.push(extracted.description);
        sections.push('');
      }
      if (extracted.holderInfo) {
        sections.push('## Holder Distribution');
        sections.push(extracted.holderInfo);
        sections.push('');
      }
    }

    // Linked Resources
    if (metadata.linkedUrls.length > 0) {
      sections.push('## Linked Resources');
      for (const url of metadata.linkedUrls) {
        sections.push(`- ${url}`);
      }
      sections.push('');
    }

    // Metadata footer
    sections.push('---');
    sections.push(`Composed by Whitepaper Grey on ${new Date().toISOString()}`);
    sections.push(`ACP Entity ID: ${metadata.entityId ?? 'N/A'}`);

    const text = sections.join('\n');

    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.length / 3000)),
      isImageOnly: false,
      isPasswordProtected: false,
      source: 'composed',
      originalUrl: pageUrl,
      resolvedUrl: pageUrl,
    };
  }

  /**
   * Fetch and extract text content from a Virtuals Protocol page.
   */
  private async fetchVirtualsPage(url: string): Promise<string> {
    const response = await this.fetchFn(url, {
      headers: { 'User-Agent': 'WhitepaperGrey/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  /**
   * Extract structured data sections from Virtuals page HTML.
   */
  private extractVirtualsData(html: string): {
    description: string;
    tokenomics: string;
    holderInfo: string;
  } {
    // Strip HTML tags for text extraction
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract sections by keyword proximity
    const description = this.extractSection(textContent, ['description', 'about', 'overview'], 500);
    const tokenomics = this.extractSection(textContent, ['supply', 'tokenomics', 'distribution', 'holders'], 500);
    const holderInfo = this.extractSection(textContent, ['holder', 'top holders', 'distribution'], 300);

    return { description, tokenomics, holderInfo };
  }

  /**
   * Extract text near a keyword from page content.
   */
  private extractSection(text: string, keywords: string[], maxLength: number): string {
    const lower = text.toLowerCase();
    for (const keyword of keywords) {
      const idx = lower.indexOf(keyword);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(text.length, idx + maxLength);
        return text.slice(start, end).trim();
      }
    }
    return '';
  }
}
