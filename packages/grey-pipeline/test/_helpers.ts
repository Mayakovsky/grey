import type { AnthropicClient } from '../src/clients/anthropic';
import { CostTracker } from '../src/telemetry/costTracker';
import {
  WhitepaperStatus,
  ClaimCategory,
  type StructuralAnalysis,
  type WhitepaperRecord,
  type ExtractedClaim,
} from '../src/types';

/** Anthropic client mock that always returns one tool_use block with `input`. */
export function mockClient(
  input: Record<string, unknown>,
  usage = { input_tokens: 100, output_tokens: 50 },
): AnthropicClient {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'tool_use', input }], usage }),
    },
  };
}

export const tracker = () => new CostTracker(3.0 / 1_000_000, 15.0 / 1_000_000);

export function emptyAnalysis(): StructuralAnalysis {
  return {
    hasAbstract: false,
    hasMethodology: false,
    hasTokenomics: false,
    hasReferences: false,
    citationCount: 0,
    verifiedCitationRatio: 0,
    hasMath: false,
    mathDensityScore: 0,
    coherenceScore: 0,
    similarityTopMatch: null,
    similarityScore: 0,
    hasAuthors: false,
    hasDates: false,
    mica: {
      claimsMicaCompliance: 'NOT_MENTIONED',
      micaCompliant: 'NO',
      micaSummary: '',
      micaSectionsFound: [],
      micaSectionsMissing: [],
    },
  };
}

export const fixtureWhitepaper: WhitepaperRecord = {
  id: 'wp-1',
  projectName: 'TestProj',
  tokenAddress: '0xABC',
  chain: 'base',
  documentUrl: 'https://example.com/wp',
  ipfsCid: null,
  knowledgeItemId: null,
  pageCount: 5,
  ingestedAt: new Date('2026-01-01T00:00:00Z'),
  status: WhitepaperStatus.VERIFIED,
  selectionScore: 0,
  metadataJson: {},
};

export function makeClaims(n: number): ExtractedClaim[] {
  return Array.from({ length: n }, (_, i) => ({
    claimId: `claim-${i + 1}`,
    category: ClaimCategory.TOKENOMICS,
    claimText: `claim ${i + 1}`,
    statedEvidence: '',
    mathematicalProofPresent: false,
    sourceSection: '',
    regulatoryRelevance: false,
  }));
}
