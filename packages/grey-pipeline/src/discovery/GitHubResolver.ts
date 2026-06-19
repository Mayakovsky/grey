// ════════════════════════════════════════════
// GitHubResolver — Tier 3 of the tiered resolver chain.
// Searches the GitHub Search API for whitepaper documents matching the
// requested project name, downloads and returns the best match.
//
// Uses GITHUB_TOKEN from env (fine-grained, public read). Unauthenticated
// is allowed but very rate-limited (10 req/min Search API) — treat a missing
// token as a soft warn and proceed with best effort.
// ════════════════════════════════════════════

import { createLogger } from '../logger';
import type { IContentResolver } from './types';

const log = createLogger({ operation: 'GitHubResolver' });

interface GitHubCodeHit {
  path: string;
  html_url: string;
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
}

interface GitHubCodeSearchResponse {
  total_count: number;
  items: GitHubCodeHit[];
  message?: string;  // error message when API returns a non-success response
}

/** File extensions we accept as candidate whitepapers */
const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.tex'];

/** Path-segment keywords that boost a hit's relevance */
const DOC_PATH_KEYWORDS = ['whitepaper', 'white-paper', 'white_paper', 'litepaper', 'techpaper', 'technical-paper', 'technical_paper', 'paper', 'docs', 'documentation', 'spec', 'specification'];

export interface GitHubResolverInput {
  projectName?: string;
  tokenAddress?: string;
  /** GitHub PAT from env; if undefined, we fall back to unauth with a warning */
  token?: string;
}

export interface GitHubResolverOutput {
  text: string;
  pageCount: number;
  sourceUrl: string;
  repoFullName: string;
}

export class GitHubResolver {
  constructor(private contentResolver: IContentResolver) {}

  /**
   * Search GitHub for likely whitepaper files matching `projectName`.
   * Returns the best-ranked fetched document, or null if nothing usable found.
   */
  async resolve(input: GitHubResolverInput, signal?: AbortSignal): Promise<GitHubResolverOutput | null> {
    const { projectName, token } = input;
    if (!projectName || !projectName.trim()) {
      return null;
    }

    const authHeader: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    if (!token) {
      log.warn('GITHUB_TOKEN not set — Tier 3 running unauthenticated (10 req/min Search cap)');
    }

    // GitHub code search qualifiers: `in:file` searches contents; `in:path`
    // restricts to path. We run two light queries and merge — wider coverage
    // and still within authenticated rate limit (30 req/min).
    const nameSlug = projectName.trim().replace(/\s+/g, '-');
    const queries = [
      `${projectName.trim()} whitepaper in:path`,
      `${nameSlug} filename:whitepaper`,
    ];

    const allHits: GitHubCodeHit[] = [];
    for (const q of queries) {
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=15`;
      try {
        const resp = await fetch(url, {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...authHeader,
          },
          signal,
        });
        if (!resp.ok) {
          log.debug('GitHub search non-OK', { status: resp.status, q });
          continue;
        }
        const body = (await resp.json()) as GitHubCodeSearchResponse;
        if (body.message) continue;
        allHits.push(...(body.items ?? []));
      } catch (err) {
        log.debug('GitHub search query failed', { q, error: (err as Error).message });
      }
    }

    // Deduplicate by path+repo
    const seen = new Set<string>();
    const hits = allHits.filter((h) => {
      const key = `${h.repository.full_name}:${h.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (hits.length === 0) {
      log.info('GitHub search returned no hits', { projectName });
      return null;
    }

    // Rank hits: prefer .pdf > .md > .tex, boost path-keyword density,
    // and organization-name match with projectName.
    const ranked = this.rankHits(hits, projectName);
    if (ranked.length === 0) {
      log.info('No acceptable extensions in GitHub hits', { projectName, total: hits.length });
      return null;
    }

    // Try the top 3 candidates in order until one fetches successfully
    for (const hit of ranked.slice(0, 3)) {
      const rawUrl = this.toRawUrl(hit);
      if (!rawUrl) continue;
      try {
        const content = await this.contentResolver.resolve(rawUrl, signal);
        if (content.text && content.text.length > 500) {
          log.info('GitHub resolved whitepaper', { repo: hit.repository.full_name, path: hit.path, length: content.text.length });
          return {
            text: content.text,
            pageCount: content.pageCount ?? 0,
            sourceUrl: rawUrl,
            repoFullName: hit.repository.full_name,
          };
        }
      } catch (err) {
        log.debug('GitHub fetch failed for candidate', { url: rawUrl.slice(0, 80), error: (err as Error).message });
        continue;
      }
    }

    return null;
  }

  /** Rank hits by extension preference, path keywords, and name match */
  private rankHits(hits: GitHubCodeHit[], projectName: string): GitHubCodeHit[] {
    const projLower = projectName.toLowerCase();

    const scored = hits
      .filter((h) => ACCEPTED_EXTENSIONS.some((ext) => h.path.toLowerCase().endsWith(ext)))
      .map((h) => {
        let score = 0;
        const path = h.path.toLowerCase();
        const ext = ACCEPTED_EXTENSIONS.find((e) => path.endsWith(e));
        if (ext === '.pdf') score += 100;
        else if (ext === '.md') score += 40;
        else if (ext === '.tex') score += 30;

        for (const kw of DOC_PATH_KEYWORDS) {
          if (path.includes(kw)) score += 20;
        }

        const ownerLower = h.repository.owner.login.toLowerCase();
        const repoLower = h.repository.name.toLowerCase();
        if (ownerLower.includes(projLower) || projLower.includes(ownerLower)) score += 30;
        if (repoLower.includes(projLower) || projLower.includes(repoLower)) score += 30;

        return { hit: h, score };
      });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.hit);
  }

  /** Convert a github.com HTML URL for a code blob to a raw.githubusercontent.com URL */
  private toRawUrl(hit: GitHubCodeHit): string | null {
    // hit.html_url is like https://github.com/{owner}/{repo}/blob/{ref}/{path}
    const m = hit.html_url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }
}
