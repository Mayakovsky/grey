// grey-pipeline/discovery — discovery-internal type contracts (M3.5 §14 ruling).
// These are resolver/discovery-internal shapes, NOT buyer-facing schema types, so they live
// here (discovery-local) rather than in @grey/schemas (which stays the frozen contract layer;
// keeping them out also respects the anti-cycle invariant). Definitions lifted verbatim from
// plugin-wpv/src/types.ts. `ResolvedContent` already lives in @grey/schemas — re-exported here so
// the discovery files import every discovery type from one place (`./types`).

export type { ResolvedContent } from '@grey/schemas';
import type { ResolvedContent } from '@grey/schemas';

export interface ProjectMetadata {
  agentName: string | null;
  entityId: string | null;
  description: string | null;
  linkedUrls: string[];
  category: string | null;
  graduationStatus: string | null;
}

export type DocumentSource = 'pdf' | 'docs_site' | 'composed' | 'ipfs';

export interface ResolvedWhitepaper {
  text: string;
  pageCount: number;
  isImageOnly: boolean;
  isPasswordProtected: boolean;
  source:
    | 'direct'
    | 'ipfs'
    | 'composed'
    | 'docs_site'
    | 'llms-txt'
    | 'site-specific'
    | 'headless-browser'
    | 'docs-crawl';
  originalUrl: string;
  resolvedUrl: string;
}

export interface TieredDiscoveryResult {
  resolved: ResolvedWhitepaper;
  documentUrl: string;
  documentSource: DocumentSource;
  tier: 1 | 2 | 3 | 4;
}

/** Interface for content resolution — implemented by FetchContentResolver / CryptoContentResolver. */
export interface IContentResolver {
  resolve(url: string, signal?: AbortSignal): Promise<ResolvedContent>;
}
