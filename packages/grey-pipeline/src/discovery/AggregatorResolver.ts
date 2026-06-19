// ════════════════════════════════════════════
// AggregatorResolver — Tier 4 of the tiered resolver chain.
// Consults CoinGecko (free tier, no key required) and CoinMarketCap
// (free tier, CMC_API_KEY required) to find whitepaper URLs for a project.
//
// Order:
//   1. CoinGecko /coins/{id} by slug (slug from project_name) → response.links.whitepaper
//   2. CoinGecko /coins/{platform}/contract/{address} by EVM address → response.links.whitepaper
//   3. CMC /v2/cryptocurrency/info by symbol/slug → urls.technical_doc[0]
//
// Rate limits:
//   CoinGecko free: ~30 calls/min
//   CMC free: 333 calls/day; ~30 req/min
// Both tiers honor an AbortSignal and per-call timeouts.
// ════════════════════════════════════════════

import type { IContentResolver } from './types';
import { COINGECKO_API_BASE, CMC_API_BASE } from './constants';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'AggregatorResolver' });

export interface AggregatorResolverInput {
  projectName?: string;
  tokenAddress?: string;
  cmcApiKey?: string;
}

export interface AggregatorResolverOutput {
  text: string;
  pageCount: number;
  sourceUrl: string;
  aggregator: 'coingecko' | 'cmc';
}

interface CoinGeckoCoinInfo {
  id: string;
  name: string;
  links?: { whitepaper?: string | null };
}

interface CoinGeckoSearchItem {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number | null;
}

interface CoinGeckoSearchResponse {
  coins?: CoinGeckoSearchItem[];
}

interface CmcInfoResponse {
  data?: Record<string, {
    name: string;
    urls?: { technical_doc?: string[]; website?: string[] };
  }>;
  status?: { error_code: number; error_message?: string };
}

export class AggregatorResolver {
  constructor(private contentResolver: IContentResolver) {}

  async resolve(input: AggregatorResolverInput, signal?: AbortSignal): Promise<AggregatorResolverOutput | null> {
    const { projectName, tokenAddress, cmcApiKey } = input;

    // --- CoinGecko by slug (no key required) ---
    const slug = this.slugify(projectName);
    if (slug) {
      const whitepaperUrl = await this.coingeckoBySlug(slug, signal);
      if (whitepaperUrl) {
        const fetched = await this.fetchDocument(whitepaperUrl, signal);
        if (fetched) return { ...fetched, aggregator: 'coingecko' };
      }
    }

    // --- CoinGecko by contract (EVM only) ---
    if (tokenAddress?.startsWith('0x') && /^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
      for (const platform of ['ethereum', 'base', 'arbitrum-one', 'optimistic-ethereum']) {
        const whitepaperUrl = await this.coingeckoByContract(platform, tokenAddress, signal);
        if (whitepaperUrl) {
          const fetched = await this.fetchDocument(whitepaperUrl, signal);
          if (fetched) return { ...fetched, aggregator: 'coingecko' };
        }
      }
    }

    // --- CMC by slug (requires key) ---
    if (cmcApiKey && slug) {
      const whitepaperUrl = await this.cmcBySlug(slug, cmcApiKey, signal);
      if (whitepaperUrl) {
        const fetched = await this.fetchDocument(whitepaperUrl, signal);
        if (fetched) return { ...fetched, aggregator: 'cmc' };
      }
    } else if (!cmcApiKey) {
      log.debug('CMC_API_KEY not set — Tier 4 CMC lookup skipped');
    }

    return null;
  }

  /** Lowercase hyphenated slug for aggregator API lookups ("Aave V3" → "aave-v3") */
  private slugify(name?: string): string | null {
    if (!name) return null;
    const s = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return s || null;
  }

  private async coingeckoBySlug(slug: string, signal?: AbortSignal): Promise<string | null> {
    try {
      // First, resolve the slug to a coin id. CoinGecko's slug and id
      // usually match for canonical projects but not always — search is robust.
      const searchUrl = `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(slug)}`;
      const searchResp = await fetch(searchUrl, { signal });
      if (!searchResp.ok) return null;
      const searchBody = (await searchResp.json()) as CoinGeckoSearchResponse;
      const topCoin = searchBody.coins?.[0];
      if (!topCoin?.id) return null;

      const infoUrl = `${COINGECKO_API_BASE}/coins/${encodeURIComponent(topCoin.id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
      const infoResp = await fetch(infoUrl, { signal });
      if (!infoResp.ok) return null;
      const info = (await infoResp.json()) as CoinGeckoCoinInfo;
      const wp = info.links?.whitepaper ?? null;
      return wp && wp.startsWith('http') ? wp : null;
    } catch (err) {
      log.debug('CoinGecko slug lookup failed', { slug, error: (err as Error).message });
      return null;
    }
  }

  private async coingeckoByContract(platform: string, address: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const url = `${COINGECKO_API_BASE}/coins/${encodeURIComponent(platform)}/contract/${encodeURIComponent(address.toLowerCase())}`;
      const resp = await fetch(url, { signal });
      if (!resp.ok) return null;
      const info = (await resp.json()) as CoinGeckoCoinInfo;
      const wp = info.links?.whitepaper ?? null;
      return wp && wp.startsWith('http') ? wp : null;
    } catch (err) {
      log.debug('CoinGecko contract lookup failed', { platform, error: (err as Error).message });
      return null;
    }
  }

  private async cmcBySlug(slug: string, apiKey: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const url = `${CMC_API_BASE}/v2/cryptocurrency/info?slug=${encodeURIComponent(slug)}`;
      const resp = await fetch(url, {
        headers: { 'X-CMC_PRO_API_KEY': apiKey },
        signal,
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as CmcInfoResponse;
      if (body.status && body.status.error_code !== 0) {
        log.debug('CMC error', { slug, error: body.status.error_message });
        return null;
      }
      const entry = body.data ? Object.values(body.data)[0] : null;
      const techDoc = entry?.urls?.technical_doc?.[0] ?? null;
      return techDoc && techDoc.startsWith('http') ? techDoc : null;
    } catch (err) {
      log.debug('CMC lookup failed', { slug, error: (err as Error).message });
      return null;
    }
  }

  private async fetchDocument(url: string, signal?: AbortSignal): Promise<{ text: string; pageCount: number; sourceUrl: string } | null> {
    try {
      const content = await this.contentResolver.resolve(url, signal);
      if (content.text && content.text.length > 500) {
        return { text: content.text, pageCount: content.pageCount ?? 0, sourceUrl: url };
      }
    } catch (err) {
      log.debug('Aggregator fetch failed', { url: url.slice(0, 80), error: (err as Error).message });
    }
    return null;
  }
}
