import { describe, it, expect } from 'vitest';
import { mapToRecord } from '../src/projection';

describe('mapToRecord (Q5)', () => {
  it('converts a Map to a plain Record', () => {
    const m = new Map<string, number>([
      ['tokenomics', 4],
      ['performance', 3],
    ]);
    expect(mapToRecord(m)).toEqual({ tokenomics: 4, performance: 3 });
  });

  it('returns an empty object for an empty Map', () => {
    expect(mapToRecord(new Map<string, number>())).toEqual({});
  });

  it('preserves non-number value types', () => {
    const m = new Map<string, string>([['k', 'v']]);
    expect(mapToRecord(m)).toEqual({ k: 'v' });
  });
});
