import { describe, it, expect } from 'vitest';
import { StructuralAnalyzer } from '../src/structural/structuralAnalyzer';

const analyzer = new StructuralAnalyzer();

describe('StructuralAnalyzer', () => {
  it('returns empty analysis for empty text', async () => {
    const a = await analyzer.analyze('', 0);
    expect(a.hasAbstract).toBe(false);
    expect(a.citationCount).toBe(0);
    expect(a.mica.micaCompliant).toBe('NO');
    expect(a.mica.micaSectionsMissing.length).toBe(7);
  });

  it('detects structural sections and math', async () => {
    const text = `Abstract\nThis paper presents a protocol.\nMethodology\nWe use \\frac{1}{2} and ∑ notation.\nTokenomics\nToken supply is fixed.\nReferences\n[1] https://example.com/paper`;
    const a = await analyzer.analyze(text, 5);
    expect(a.hasAbstract).toBe(true);
    expect(a.hasMethodology).toBe(true);
    expect(a.hasTokenomics).toBe(true);
    expect(a.hasReferences).toBe(true);
    expect(a.hasMath).toBe(true);
  });

  it('computeHypeTechRatio: pure hype with no tech is Infinity', () => {
    expect(analyzer.computeHypeTechRatio('revolutionary moonshot 100x guaranteed')).toBe(Infinity);
  });

  it('computeHypeTechRatio: tech tokens lower the ratio', () => {
    const ratio = analyzer.computeHypeTechRatio('revolutionary protocol consensus validator merkle proof');
    expect(ratio).toBeLessThan(1);
  });

  it('computeQuickFilterScore is bounded 1..5', () => {
    const empty = analyzer.computeQuickFilterScore({
      hasAbstract: false, hasMethodology: false, hasTokenomics: false, hasReferences: false,
      citationCount: 0, verifiedCitationRatio: 0, hasMath: false, mathDensityScore: 0,
      coherenceScore: 0, similarityTopMatch: null, similarityScore: 0, hasAuthors: false, hasDates: false,
      mica: { claimsMicaCompliance: 'NOT_MENTIONED', micaCompliant: 'NO', micaSummary: '', micaSectionsFound: [], micaSectionsMissing: [] },
    });
    expect(empty).toBe(1);
  });

  it('checkMicaCompliance flags a claim that fails the structural check', () => {
    const m = analyzer.checkMicaCompliance('This token is fully MiCA compliant under regulation (eu) 2023/1114.');
    expect(m.claimsMicaCompliance).toBe('YES');
    expect(m.micaCompliant).toBe('NO');
    expect(m.micaSummary).toContain('Claims MiCA compliance but fails');
  });
});
