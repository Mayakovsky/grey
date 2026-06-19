// grey-pipeline/discovery — discovery-scoped constants (M3.5 Phase A).
// The M1 Step 2 extraction dropped discovery constants from src/constants.ts ("discovery/
// selection/fork/ACP/supabase constants dropped"); the discovery port re-introduces the subset
// the ported resolvers need, here (discovery-local) rather than in the verification constants.
// Values lifted verbatim from plugin-wpv/src/constants.ts.

export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

export const IMAGE_ONLY_CHAR_THRESHOLD = 100;

export const VIRTUALS_PAGE_URL = 'https://app.virtuals.io/virtuals/';

/** Patterns for finding whitepaper links in HTML */
export const WHITEPAPER_LINK_PATTERNS = [
  /href=["']([^"']*\.pdf)["']/gi,
  /href=["']([^"']*whitepaper[^"']*)["']/gi,
  /href=["']([^"']*litepaper[^"']*)["']/gi,
  /href=["']([^"']*tokenomics[^"']*)["']/gi,
  /href=["']([^"']*\/docs[^"']*)["']/gi,
] as const;

/** Patterns for known documentation hosting platforms */
export const DOCS_SITE_PATTERNS = [
  /gitbook\.io/i,
  /docs\.\w+\.\w+/i,
  /notion\.so/i,
  /medium\.com/i,
  /github\.com.*\.md/i,
] as const;

export const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

export const CMC_API_BASE = 'https://pro-api.coinmarketcap.com';
