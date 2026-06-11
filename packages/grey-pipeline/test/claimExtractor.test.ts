import { describe, it, expect } from 'vitest';
import { ClaimExtractor } from '../src/extraction/claimExtractor';
import { mockClient, tracker } from './_helpers';

const longText = 'A'.repeat(300) + ' protocol consensus tokenomics';

describe('ClaimExtractor', () => {
  it('parses claims from a tool_use response', async () => {
    const client = mockClient({
      claims: [
        {
          category: 'TOKENOMICS',
          claimText: 'Fixed supply of 1B tokens',
          statedEvidence: 'Section 4',
          mathematicalProofPresent: true,
          sourceSection: 'Tokenomics',
          regulatoryRelevance: false,
        },
      ],
    });
    const ex = new ClaimExtractor({ client, costTracker: tracker() });
    const claims = await ex.extractClaims(longText, 'TestProj');
    expect(claims).toHaveLength(1);
    expect(claims[0].claimId).toBe('claim-1');
    expect(claims[0].category).toBe('TOKENOMICS');
    expect(claims[0].mathematicalProofPresent).toBe(true);
  });

  it('skips extraction below the min-text threshold', async () => {
    const ex = new ClaimExtractor({ client: mockClient({ claims: [] }), costTracker: tracker() });
    expect(await ex.extractClaims('too short', 'P')).toEqual([]);
  });

  it('records token usage', async () => {
    const t = tracker();
    const ex = new ClaimExtractor({ client: mockClient({ claims: [] }), costTracker: t });
    await ex.extractClaims(longText, 'P');
    expect(t.getTotalTokens()).toEqual({ input: 100, output: 50 });
  });

  it('defaults unknown category to SCIENTIFIC and drops empty claimText', async () => {
    const client = mockClient({
      claims: [
        { category: 'WEIRD', claimText: 'kept', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '', regulatoryRelevance: false },
        { category: 'TOKENOMICS', claimText: '', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '', regulatoryRelevance: false },
      ],
    });
    const ex = new ClaimExtractor({ client, costTracker: tracker() });
    const claims = await ex.extractClaims(longText, 'P');
    expect(claims).toHaveLength(1);
    expect(claims[0].category).toBe('SCIENTIFIC');
  });
});
