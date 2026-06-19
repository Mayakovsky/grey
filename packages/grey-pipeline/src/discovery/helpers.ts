// grey-pipeline/discovery — JobRouter-local helpers (M3.5 FDQ-7a).
// Ported verbatim from plugin-wpv/src/acp/JobRouter.ts (logic unchanged): the name
// canonicalization + version helpers the dedupe-on-address upsert (pipeline §2.6) and the
// discovery-stack name resolution depend on. KNOWN_PROTOCOL_NAMES already lives in
// ../constants/protocols (ported at M1 Step 2); re-exported here so helpers form one surface.

import { KNOWN_PROTOCOL_NAMES } from '../constants/protocols';

export { KNOWN_PROTOCOL_NAMES };

/** Convert GitHub blob URLs to raw.githubusercontent.com (JobRouter 29-33). */
export function normalizeGitHubUrl(url: string): string {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}

// ── Name canonicalization (JobRouter 55-82) ──

const NAME_SUFFIX_PATTERN = /\s+(token|protocol|coin|stablecoin|chain|network)s?$/i;

/** Explicit synonyms for plural/singular forms that suffix-stripping doesn't catch. */
const NAME_SYNONYMS = new Map<string, string>([
  // Virtuals: on-chain name is "Virtual Protocol" but canonical is "Virtuals Protocol"
  ['virtual', 'Virtuals Protocol'],
]);

/**
 * Collapse verbose on-chain contract labels (e.g. "Aave Token" → "Aave") to canonical
 * short names: strip trailing Token/Protocol/Coin/etc., look the base up against
 * KNOWN_PROTOCOL_NAMES (case-insensitive), check a small synonym map, else return input
 * trimmed (never over-merge unknown names). Ported verbatim from JobRouter 63-82.
 */
export function canonicalizeProjectName(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  const base = lower.replace(NAME_SUFFIX_PATTERN, '').trim();

  // Synonym map check
  const syn = NAME_SYNONYMS.get(base);
  if (syn) return syn;

  // KNOWN_PROTOCOL_NAMES check — compare base forms on both sides
  for (const known of KNOWN_PROTOCOL_NAMES) {
    const knownBase = known.toLowerCase().replace(NAME_SUFFIX_PATTERN, '').trim();
    if (knownBase === base) return known;
  }

  return trimmed;
}

/**
 * Strip version suffixes for fuzzy DB matching ("Aave V3" → "Aave"). Returns null if no
 * version suffix found (no point re-querying with the same string). JobRouter 171-174.
 */
export function stripVersionSuffix(name: string): string | null {
  const stripped = name.replace(/\s+[vV]\d+(\.\d+)*\s*$/, '').trim();
  return stripped !== name.trim() ? stripped : null;
}

/**
 * Extract the version token from a project name. "Aave V3" → "v3", "Uniswap" → null.
 * Used by dedupe-on-address logic to keep v1 and v3 rows distinct even when they share a
 * token contract. JobRouter 181-185.
 */
export function extractVersion(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\b(v\d+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Returns true if the name contains violation keywords — do not cache. Ported verbatim from
 * JobRouter.hasViolationKeywords (1924-1927); a dependency of the dedupe-on-address upsert
 * (§2.6) which skips persistence for poisoned names. (Companion to the FDQ-7 helper set.)
 */
export function hasViolationKeywords(name: string): boolean {
  const lower = name.toLowerCase();
  return /\bscam\b|\bfraud\b|\brug\s*pull\b|\bnsfw\b|\bexplicit\b|\bporn\b|\bhack\b|\bexploit\b|\bphish\b/.test(
    lower,
  );
}
