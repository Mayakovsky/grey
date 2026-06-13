// grey-pipeline — ClaimExtractor (Layer 2).
// Ported from plugin-wpv/src/verification/ClaimExtractor.ts. LLM-based claim
// extraction via the raw-fetch Anthropic client + tool_use. Only imports repointed
// and WPV_MODEL→GREY_MODEL (D-MODEL); the AnthropicClient interface now lives in
// ../clients/anthropic. Prompts, tool schema, and parsing logic are verbatim.

import type { ExtractedClaim, ClaimCategory } from '@grey/schemas';
import type { CostTracker } from '../telemetry/costTracker';
import type { AnthropicClient } from '../clients/anthropic';
import { GREY_MODEL, CLAIM_EXTRACTION_MAX_TOKENS } from '../constants';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'ClaimExtractor' });

const EXTRACTION_SYSTEM_PROMPT = `You are a scientific claim extractor for cryptocurrency and DeFi whitepapers.

Extract all testable claims from the document that are about the TARGET PROJECT specified by the user. A testable claim is a specific assertion that can be verified against external data, mathematical analysis, or benchmark comparison.

IMPORTANT:
- Only extract claims that the target project itself makes about its OWN technology, tokenomics, or performance.
- Do NOT extract claims about other projects mentioned in historical context, background sections, or comparisons (e.g., if an Ethereum whitepaper discusses Bitcoin's block time in its History section, that is NOT an Ethereum claim).
- Do NOT extract claims from introductory summaries of prior work — only claims the project makes about itself.

Categorize each claim into one of these categories:
- TOKENOMICS: Claims about token supply, distribution, yield, APY, vesting, burns, inflation
- PERFORMANCE: Claims about TPS, latency, throughput, scalability, benchmarks
- CONSENSUS: Claims about consensus mechanisms, finality, validator selection, fault tolerance
- SCIENTIFIC: Claims citing academic research, mathematical proofs, novel algorithms

For each claim, extract:
- claimText: The exact claim being made
- statedEvidence: What evidence the whitepaper provides
- CRITICAL: When extracting mathematical claims (fault tolerance thresholds, node requirements, performance bounds), verify that the claimed threshold is mathematically consistent with the cited evidence. For example, if an algorithm requires 3f+1 nodes, the fault tolerance is f < n/3 (not f < n/2). If the whitepaper text states one threshold but the cited formula implies a different one, report the threshold that is mathematically correct based on the formula, and note the discrepancy in statedEvidence.
- mathematicalProofPresent: Whether a mathematical proof accompanies the claim
- sourceSection: Which section of the document contains this claim
- regulatoryRelevance: Whether this claim EXPLICITLY relates to regulatory compliance (MiCA, EU regulation, KYC/AML, ESMA requirements, investor protection, risk disclosure obligations, or legal compliance frameworks). Set true ONLY for claims that explicitly mention regulatory standards or legal requirements by name. A technical whitepaper describing protocol mechanics is NOT regulatory compliance — do not conflate technical descriptions with MiCA compliance. Also flag risk disclosures — note whether they are substantive (specific, quantified risks) or boilerplate (generic, vague warnings).

Example:
{
  "category": "TOKENOMICS",
  "claimText": "Staking APY will be maintained at 12% through algorithmic token emission",
  "statedEvidence": "Emission curve formula in Section 4.2",
  "mathematicalProofPresent": true,
  "sourceSection": "Tokenomics",
  "regulatoryRelevance": false
}`;

const CLAIM_EXTRACTION_TOOL = {
  name: 'extract_claims',
  description: 'Extract testable claims from the whitepaper text',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['TOKENOMICS', 'PERFORMANCE', 'CONSENSUS', 'SCIENTIFIC'],
            },
            claimText: { type: 'string' },
            statedEvidence: { type: 'string' },
            mathematicalProofPresent: { type: 'boolean' },
            sourceSection: { type: 'string' },
            regulatoryRelevance: { type: 'boolean' },
          },
          required: [
            'category',
            'claimText',
            'statedEvidence',
            'mathematicalProofPresent',
            'sourceSection',
            'regulatoryRelevance',
          ],
        },
      },
    },
    required: ['claims'],
  },
};

export class ClaimExtractor {
  private client: AnthropicClient;
  private costTracker: CostTracker;
  private model: string;

  constructor(deps: { client: AnthropicClient; costTracker: CostTracker; model?: string }) {
    this.client = deps.client;
    this.costTracker = deps.costTracker;
    this.model = deps.model ?? GREY_MODEL;
  }

  /**
   * Extract testable claims from whitepaper text.
   * Returns empty array (not error) if no claims found.
   */
  async extractClaims(
    text: string,
    projectName: string,
    options?: { maxRetries?: number; requirementText?: string | null; costTracker?: CostTracker },
  ): Promise<ExtractedClaim[]> {
    const maxRetries = options?.maxRetries ?? 2;
    const requirementText = options?.requirementText ?? null;
    const tracker = options?.costTracker ?? this.costTracker;

    if (!text || text.trim().length === 0) return [];

    // Minimum text threshold — SPA shells, empty pages, and image-only PDFs
    // don't have enough text for meaningful claim extraction.
    const MIN_TEXT_FOR_EXTRACTION = 200;
    if (text.trim().length < MIN_TEXT_FOR_EXTRACTION) {
      log.info('Text too short for claim extraction — skipping Sonnet call', {
        textLength: text.trim().length,
        threshold: MIN_TEXT_FOR_EXTRACTION,
        projectName,
      });
      return [];
    }

    const userContent = requirementText
      ? `The buyer has requested: "${requirementText}"\n\nExtract all testable claims from this ${projectName} whitepaper, with SPECIAL FOCUS on claims relevant to the buyer's request. If the request mentions mathematical evaluation, formulas, or quantitative analysis, prioritize extracting mathematical definitions, equations, model parameters, and quantitative assertions. Tag these with mathematicalProofPresent: true if they contain formal/quantitative content.\n\n${text.slice(0, 50000)}`
      : `Extract all testable claims from this ${projectName} whitepaper:\n\n${text.slice(0, 50000)}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: CLAIM_EXTRACTION_MAX_TOKENS,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
          tools: [CLAIM_EXTRACTION_TOOL],
        });

        // Track token usage
        tracker.recordUsage(response.usage.input_tokens, response.usage.output_tokens);

        // Extract claims from tool_use response
        return this.parseResponse(response.content);
      } catch (err) {
        // Retry on rate limit (429) after waiting for the reset window
        if (attempt < maxRetries && this.isRateLimitError(err)) {
          const waitMs = this.extractRetryAfter(err);
          log.warn('Rate limited — waiting before retry', {
            projectName,
            attempt: attempt + 1,
            waitMs,
          });
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        log.warn('Claim extraction failed', { projectName }, err);
        throw err;
      }
    }

    return []; // Should not reach here
  }

  private isRateLimitError(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.status === 429) return true;
      const msg = String(e.message ?? '');
      if (msg.includes('rate_limit') || msg.includes('429')) return true;
    }
    return false;
  }

  private extractRetryAfter(err: unknown): number {
    // Try to parse retry-after from error headers or message
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const headers = e.headers as Record<string, string> | undefined;
      if (headers?.['retry-after']) {
        const seconds = parseInt(headers['retry-after'], 10);
        if (!isNaN(seconds)) return seconds * 1000;
      }
    }
    // Default: wait 65 seconds (rate limit window is 60s + buffer)
    return 65000;
  }

  private parseResponse(
    content: { type: string; input?: Record<string, unknown>; text?: string }[],
  ): ExtractedClaim[] {
    for (const block of content) {
      if (block.type === 'tool_use' && block.input) {
        const input = block.input as { claims?: unknown[] };
        if (!Array.isArray(input.claims)) return [];

        return input.claims
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map((c, i) => ({
            claimId: `claim-${i + 1}`,
            category: this.parseCategory(String(c.category ?? 'SCIENTIFIC')),
            claimText: String(c.claimText ?? ''),
            statedEvidence: String(c.statedEvidence ?? ''),
            mathematicalProofPresent: Boolean(c.mathematicalProofPresent),
            sourceSection: String(c.sourceSection ?? ''),
            regulatoryRelevance: Boolean(c.regulatoryRelevance),
          }))
          .filter((c) => c.claimText.length > 0);
      }
    }

    return [];
  }

  private parseCategory(raw: string): ClaimCategory {
    const upper = raw.toUpperCase();
    if (upper === 'TOKENOMICS') return 'TOKENOMICS' as ClaimCategory;
    if (upper === 'PERFORMANCE') return 'PERFORMANCE' as ClaimCategory;
    if (upper === 'CONSENSUS') return 'CONSENSUS' as ClaimCategory;
    return 'SCIENTIFIC' as ClaimCategory;
  }
}
