// ════════════════════════════════════════════
// Tier 3: WebSearchFallback
// Search the web for a project's whitepaper when Tiers 1-2 fail.
// Uses DuckDuckGo HTML API (free, no key needed).
// ════════════════════════════════════════════

import { createLogger } from '../logger';

const log = createLogger({ operation: 'WebSearchFallback' });

export interface SearchResult {
  url: string;
  title: string;
}

/**
 * Known whitepaper URLs for well-documented protocols.
 * Each entry: [pattern, url]. Pattern is tested via word-boundary regex
 * against the project name to avoid substring collisions.
 * All URLs verified via curl — only 200-status entries included.
 */
const KNOWN_WHITEPAPER_URLS: Array<[RegExp, string]> = [
  // ── DeFi Protocols ──
  // Uniswap: version-specific entries first, generic last
  [/\buniswap\s+v4\b/i, 'https://docs.uniswap.org/contracts/v4/overview'],
  [/\buniswap\s+v3\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],
  [/\buniswap\b/i, 'https://uniswap.org/whitepaper-v3.pdf'],
  [/\baave\b/i, 'https://raw.githubusercontent.com/aave/aave-v3-core/master/techpaper/Aave_V3_Technical_Paper.pdf'],
  [/\bmakerdao\b|\bmaker\s*dao\b/i, 'https://makerdao.com/whitepaper/White%20Paper%20-The%20Maker%20Protocol_%20MakerDAO%E2%80%99s%20Multi-Collateral%20Dai%20(MCD)%20System-FINAL-%20021720.pdf'],
  [/\bcompound\b/i, 'https://compound.finance/documents/Compound.Whitepaper.pdf'],
  [/\blido\b/i, 'https://lido.fi/static/Lido:Ethereum-Liquid-Staking.pdf'],
  // Chainlink: version-specific first, generic last (default: latest V2)
  [/\bchainlink\s+v2\b/i, 'https://research.chain.link/whitepaper-v2.pdf'],
  [/\bchainlink\s+v1\b/i, 'https://research.chain.link/whitepaper-v1.pdf'],
  [/\bchainlink\b/i, 'https://research.chain.link/whitepaper-v2.pdf'],
  [/\bcurve\b/i, 'https://curve.fi/files/stableswap-paper.pdf'],
  [/\bsynthetix\b/i, 'https://docs.synthetix.io/synthetix-protocol/the-synthetix-protocol/synthetix-litepaper'],
  [/\byearn\b/i, 'https://docs.yearn.fi/getting-started/intro'],
  [/\bdydx\b/i, 'https://docs.dydx.exchange'],
  [/\bgmx\b/i, 'https://gmxio.gitbook.io/gmx/overview'],
  [/\bfrax\b/i, 'https://docs.frax.finance'],
  [/\bjupiter\b/i, 'https://station.jup.ag/docs'],
  [/\braydium\b/i, 'https://docs.raydium.io'],
  [/\bsushiswap\b|\bsushi\s*swap\b/i, 'https://docs.sushi.com'],
  [/\bpancakeswap\b|\bpancake\s*swap\b/i, 'https://docs.pancakeswap.finance'],
  [/\bethena\b/i, 'https://ethena-labs.gitbook.io/ethena-labs/solution-overview/usde-overview'],
  [/\bbalancer\b/i, 'https://docs.balancer.fi'],
  [/\bseamless\b/i, 'https://docs.seamlessprotocol.com'],
  [/\baerodrome\b/i, 'https://raw.githubusercontent.com/aerodrome-finance/docs/main/content/tokenomics.mdx'],
  [/\bpyth\b/i, 'https://docs.pyth.network'],
  // ── L1/L2 Chains ──
  [/\bsolana\b/i, 'https://solana.com/solana-whitepaper.pdf'],
  [/\bethereum\b/i, 'https://ethereum.org/en/whitepaper'],
  [/\bbitcoin\b/i, 'https://bitcoin.org/bitcoin.pdf'],
  [/\bpolkadot\b/i, 'https://polkadot.network/papers/polkadot-whitepaper.pdf'],
  [/\bavalanche\b|\bavax\b/i, 'https://www.avalabs.org/whitepapers'],
  [/\bnear\b/i, 'https://near.org/papers/the-official-near-white-paper'],
  [/\bcelestia\b/i, 'https://arxiv.org/pdf/1905.09274.pdf'],
  [/\baptos\b/i, 'https://aptos.dev/en/network/blockchain/aptos-white-paper'],
  [/\bsui\b/i, 'https://docs.sui.io/paper/sui.pdf'],
  [/\barbitrum\b/i, 'https://raw.githubusercontent.com/OffchainLabs/nitro/master/docs/Nitro-whitepaper.pdf'],
  // ── Infrastructure ──
  [/\blayerzero\b|\blayer\s*zero\b/i, 'https://layerzero.network/publications/LayerZero_Whitepaper_V2.1.0.pdf'],
  [/\bwormhole\b/i, 'https://docs.wormhole.com/wormhole'],
];

export class WebSearchFallback {
  constructor(private fetchFn: typeof fetch = fetch) {}

  /**
   * Search for a project's whitepaper PDF.
   * Returns the best candidate URL, or null.
   */
  async searchWhitepaper(projectName: string): Promise<string | null> {
    // Check known URL map first — instant, no network
    for (const [pattern, url] of KNOWN_WHITEPAPER_URLS) {
      if (pattern.test(projectName)) {
        log.info('Known URL map hit', { projectName, pattern: pattern.source, url: url.slice(0, 60) });
        return url;
      }
    }

    const queries = [
      `${projectName} whitepaper filetype:pdf`,
      `${projectName} technical paper filetype:pdf`,
      `${projectName} protocol specification`,
      `${projectName} technical RFC`,
      `${projectName} tokenomics whitepaper`,
      `${projectName} protocol documentation`,
    ];

    for (const query of queries) {
      try {
        const results = await this.search(query);
        const candidate = this.pickBestResult(results, projectName);
        if (candidate) return candidate;
      } catch {
        // Try next query
      }
    }

    // Fallback: if project name has a version suffix (e.g., "Aave V3", "Uniswap v2"),
    // retry with the base name only
    const baseNameMatch = projectName.match(/^(.+?)\s+[vV]\d+$/);
    if (baseNameMatch) {
      const baseName = baseNameMatch[1].trim();
      const fallbackQueries = [
        `${baseName} whitepaper filetype:pdf`,
        `${baseName} technical paper filetype:pdf`,
        `${baseName} protocol documentation`,
      ];
      for (const query of fallbackQueries) {
        try {
          const results = await this.search(query);
          const candidate = this.pickBestResult(results, baseName);
          if (candidate) return candidate;
        } catch {
          // Try next query
        }
      }
    }

    return null;
  }

  /**
   * Execute a DuckDuckGo search and extract result URLs.
   */
  async search(query: string): Promise<SearchResult[]> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const response = await this.fetchFn(url, {
        headers: {
          'User-Agent': 'WhitepaperGrey/1.0',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseResults(html);
    } catch (err) {
      log.warn('Search failed', { query }, err);
      return [];
    }
  }

  /**
   * Parse DuckDuckGo HTML results page for links.
   */
  private parseResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    // DuckDuckGo HTML results have links in <a class="result__a" href="...">
    const linkPattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]*)</gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      if (url && !url.includes('duckduckgo.com')) {
        results.push({ url: decodeURIComponent(url), title: title ?? '' });
      }
    }
    return results.slice(0, 10); // Top 10 results
  }

  /**
   * Pick the best search result — prefer PDFs from plausible sources.
   */
  private pickBestResult(results: SearchResult[], projectName: string): string | null {
    const nameLower = projectName.toLowerCase();

    // First pass: PDF from project's own domain or IPFS
    for (const r of results) {
      const urlLower = r.url.toLowerCase();
      if (
        urlLower.endsWith('.pdf') &&
        (urlLower.includes(nameLower) || urlLower.includes('ipfs') || urlLower.includes('github'))
      ) {
        return r.url;
      }
    }

    // Second pass: research/docs/papers subdomains — high-quality sources
    for (const r of results) {
      try {
        const hostname = new URL(r.url).hostname.toLowerCase();
        if (/^(research|docs|papers|whitepaper)\./.test(hostname)) {
          if (r.url.toLowerCase().includes(nameLower) || r.title.toLowerCase().includes(nameLower)) {
            return r.url;
          }
        }
      } catch { continue; }
    }

    // Third pass: any PDF
    for (const r of results) {
      if (r.url.toLowerCase().endsWith('.pdf')) {
        return r.url;
      }
    }

    // Fourth pass: docs sites — match project name in URL OR title (not both required)
    for (const r of results) {
      const urlLower = r.url.toLowerCase();
      const titleLower = r.title.toLowerCase();
      const isDocsSite = urlLower.includes('docs.') || urlLower.includes('/docs/') || urlLower.includes('gitbook');
      const hasProjectRef = titleLower.includes(nameLower) || urlLower.includes(nameLower);
      if (isDocsSite && hasProjectRef) {
        return r.url;
      }
    }

    // Fifth pass: GitBook URLs (almost always project documentation)
    for (const r of results) {
      try {
        const hostname = new URL(r.url).hostname.toLowerCase();
        if (hostname.includes('gitbook.io')) {
          return r.url;
        }
      } catch { continue; }
    }

    return null;
  }
}
