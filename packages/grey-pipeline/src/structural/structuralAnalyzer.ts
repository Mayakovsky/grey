// grey-pipeline — StructuralAnalyzer (Layer 1).
// Ported verbatim from plugin-wpv/src/verification/StructuralAnalyzer.ts. Six
// structural checks, no LLM. ElizaOS-free. Only imports repointed; the one unused
// placeholder param (checkPlagiarism — the embeddings stub) is underscore-prefixed.

import type {
  StructuralAnalysis,
  MicaAnalysis,
  MicaClaimStatus,
  MicaComplianceStatus,
} from '@grey/schemas';
import {
  HYPE_KEYWORDS,
  TECH_KEYWORDS,
  MICA_CLAIM_KEYWORDS,
  MICA_SECTION_PATTERNS,
  MICA_REQUIRED_SECTIONS,
  MICA_THRESHOLDS,
} from '../constants';
// (plugin-wpv declared an unused module-level logger here; dropped as dead code.)

/** Section detection function type (matches existing detectSections signature) */
export interface SectionDetector {
  detectSections(text: string): {
    sections: { name: string; startLine: number; endLine: number }[];
  };
}

/** DOI verification interface (matches ScientificPaperDetector) */
export interface PaperDetector {
  detect(url: string, content?: string): Promise<{ isScientificPaper: boolean }>;
}

// ── Regex patterns ───────────────────────────

const LATEX_MATH_PATTERN = /\\(?:frac|sum|int|prod|lim|partial|nabla|Delta|Sigma|Omega)\b/;
const UNICODE_MATH_PATTERN = /[∑∫∀∃≤≥∂∇Δ±×÷√∞∝≈≠≡∈∉⊂⊃∪∩]/;
const EQUATION_PATTERN = /[=<>]\s*[a-zA-Z0-9_]+\s*[+\-*/^]\s*[a-zA-Z0-9_]+/;

const DOI_PATTERN = /10\.\d{4,}\/[^\s]+/g;
const URL_REF_PATTERN = /https?:\/\/[^\s)]+/g;

const AUTHOR_PATTERN = /(?:^|\n)(?:(?:[A-Z][a-z]+\s+){1,3}(?:and\s+)?(?:[A-Z][a-z]+\s*)+[,\n])/;
const DATE_PATTERN =
  /(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}[-/]\d{2})/;
const VERSION_PATTERN = /v(?:ersion)?\s*\d+\.?\d*/i;

export class StructuralAnalyzer {
  constructor(
    private deps: {
      sectionDetector?: SectionDetector;
      paperDetector?: PaperDetector;
    } = {},
  ) {}

  /** Run all 6 structural checks and return analysis. */
  async analyze(text: string, _pageCount: number): Promise<StructuralAnalysis> {
    if (!text || text.length === 0) {
      return this.emptyAnalysis();
    }

    const sections = this.checkSectionCompleteness(text);
    const citations = this.checkCitationDensity(text);
    const math = this.checkMathNotation(text);
    const coherence = this.checkCoherence(text);
    const plagiarism = this.checkPlagiarism(text);
    const metadata = this.checkMetadata(text);
    const mica = this.checkMicaCompliance(text);

    return {
      ...sections,
      ...citations,
      ...math,
      ...coherence,
      ...plagiarism,
      ...metadata,
      mica,
    };
  }

  /** Quick filter score (1–5) from structural analysis. */
  computeQuickFilterScore(analysis: StructuralAnalysis): number {
    let score = 1; // base

    const sectionCount = [
      analysis.hasAbstract,
      analysis.hasMethodology,
      analysis.hasTokenomics,
      analysis.hasReferences,
    ].filter(Boolean).length;
    if (sectionCount >= 3) score += 1;

    if (analysis.hasMath) score += 1;

    if (analysis.citationCount > 2) score += 1;

    if (analysis.coherenceScore > 0.5 && (analysis.hasAuthors || analysis.hasDates)) {
      score += 1;
    }

    return Math.min(5, score);
  }

  /**
   * Compute hype vs. tech ratio.
   * Marketing tokens / technical tokens. >3.0 = hype flag.
   */
  computeHypeTechRatio(text: string): number {
    const lowerText = text.toLowerCase();

    let hypeCount = 0;
    for (const keyword of HYPE_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) hypeCount += matches.length;
    }

    let techCount = 0;
    for (const keyword of TECH_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) techCount += matches.length;
    }

    // Also count math notation as tech tokens
    const mathMatches = text.match(LATEX_MATH_PATTERN);
    const unicodeMathMatches = text.match(UNICODE_MATH_PATTERN);
    techCount += (mathMatches?.length ?? 0) + (unicodeMathMatches?.length ?? 0);

    // DOI references count as tech
    const doiMatches = text.match(DOI_PATTERN);
    techCount += doiMatches?.length ?? 0;

    if (techCount === 0) return hypeCount > 0 ? Infinity : 0;
    return hypeCount / techCount;
  }

  // ── Private checks ─────────────────────────

  private checkSectionCompleteness(
    text: string,
  ): Pick<StructuralAnalysis, 'hasAbstract' | 'hasMethodology' | 'hasTokenomics' | 'hasReferences'> {
    return {
      hasAbstract:
        /\babstract\b/i.test(text) || /\bsummary\b/i.test(text) || /\boverview\b/i.test(text),
      hasMethodology:
        /\bmethodology\b/i.test(text) ||
        /\bmethods?\b/i.test(text) ||
        /\bprotocol design\b/i.test(text),
      hasTokenomics:
        /\btokenomics\b/i.test(text) ||
        /\btoken\s*(?:economics?|distribution|allocation|supply)\b/i.test(text),
      hasReferences: /\breferences\b/i.test(text) || /\bbibliography\b/i.test(text),
    };
  }

  private checkCitationDensity(
    text: string,
  ): Pick<StructuralAnalysis, 'citationCount' | 'verifiedCitationRatio'> {
    const dois = text.match(DOI_PATTERN) ?? [];
    const urls = text.match(URL_REF_PATTERN) ?? [];

    // Deduplicate
    const uniqueRefs = new Set([...dois, ...urls]);
    const citationCount = uniqueRefs.size;

    // Simplified verification ratio: DOIs are more likely legit references
    const verifiedCitationRatio = citationCount > 0 ? dois.length / citationCount : 0;

    return { citationCount, verifiedCitationRatio };
  }

  private checkMathNotation(
    text: string,
  ): Pick<StructuralAnalysis, 'hasMath' | 'mathDensityScore'> {
    const hasLatex = LATEX_MATH_PATTERN.test(text);
    const hasUnicode = UNICODE_MATH_PATTERN.test(text);
    const hasEquations = EQUATION_PATTERN.test(text);

    const hasMath = hasLatex || hasUnicode || hasEquations;

    // Math density: count occurrences per 1000 chars
    let mathTokens = 0;
    const latexMatches = text.match(new RegExp(LATEX_MATH_PATTERN.source, 'g'));
    const unicodeMatches = text.match(new RegExp(UNICODE_MATH_PATTERN.source, 'g'));
    mathTokens += (latexMatches?.length ?? 0) + (unicodeMatches?.length ?? 0);

    const mathDensityScore =
      text.length > 0 ? Math.min(1, (mathTokens / (text.length / 1000)) * 0.1) : 0;

    return { hasMath, mathDensityScore };
  }

  private checkCoherence(text: string): Pick<StructuralAnalysis, 'coherenceScore'> {
    if (text.length < 100) return { coherenceScore: 0 };

    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 3) return { coherenceScore: 0.1 };

    // Check section length variance (more uniform = more coherent)
    const lineLengths = lines.map((l) => l.length);
    const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length;
    const variance =
      lineLengths.reduce((acc, l) => acc + (l - avgLength) ** 2, 0) / lineLengths.length;
    const cv = avgLength > 0 ? Math.sqrt(variance) / avgLength : 1;

    // Check repetition ratio (lower = better)
    const uniqueLines = new Set(lines.map((l) => l.trim().toLowerCase()));
    const repetitionRatio = 1 - uniqueLines.size / lines.length;

    // Coherence: penalize high variance and high repetition
    let score = 1.0;
    if (cv > 2) score -= 0.3;
    if (repetitionRatio > 0.3) score -= 0.3;
    if (lines.length < 10) score -= 0.2;

    return { coherenceScore: Math.max(0, Math.min(1, score)) };
  }

  private checkPlagiarism(
    _text: string,
  ): Pick<StructuralAnalysis, 'similarityTopMatch' | 'similarityScore'> {
    // Plagiarism check requires embedding comparison against corpus.
    // Placeholder: returns no match. (plugin-wpv stub; embeddings are out of Step 2 scope.)
    return { similarityTopMatch: null, similarityScore: 0 };
  }

  private checkMetadata(text: string): Pick<StructuralAnalysis, 'hasAuthors' | 'hasDates'> {
    return {
      hasAuthors: AUTHOR_PATTERN.test(text),
      hasDates: DATE_PATTERN.test(text) || VERSION_PATTERN.test(text),
    };
  }

  /**
   * MiCA compliance check (EU Regulation 2023/1114).
   * L1 only — keyword scan + section detection. No LLM needed.
   */
  checkMicaCompliance(text: string): MicaAnalysis {
    const lowerText = text.toLowerCase();

    // 1. Does the whitepaper CLAIM MiCA compliance?
    let claimsMicaCompliance: MicaClaimStatus = 'NOT_MENTIONED';
    for (const keyword of MICA_CLAIM_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        claimsMicaCompliance = 'YES';
        break;
      }
    }

    // 2. Check for the 7 required MiCA sections
    const sectionsFound: string[] = [];
    const sectionsMissing: string[] = [];

    for (const section of MICA_REQUIRED_SECTIONS) {
      const patterns = MICA_SECTION_PATTERNS[section];
      const found = patterns?.some((pattern) => pattern.test(text)) ?? false;
      if (found) {
        sectionsFound.push(section);
      } else {
        sectionsMissing.push(section);
      }
    }

    // 3. Check for utility token exemption (MiCA Article 4(3))
    const isUtilityToken = this.detectUtilityToken(lowerText);

    // 4. Determine compliance status
    let micaCompliant: MicaComplianceStatus;
    const foundCount = sectionsFound.length;

    if (isUtilityToken && claimsMicaCompliance === 'NOT_MENTIONED') {
      // Utility tokens granting access to existing/functioning products are MiCA-exempt
      micaCompliant = 'NOT_APPLICABLE';
    } else if (foundCount >= MICA_THRESHOLDS.COMPLIANT) {
      micaCompliant = 'YES';
    } else if (foundCount >= MICA_THRESHOLDS.PARTIAL) {
      micaCompliant = 'PARTIAL';
    } else {
      micaCompliant = 'NO';
    }

    // 5. Generate summary
    const summaryParts: string[] = [];

    if (micaCompliant === 'NOT_APPLICABLE') {
      summaryParts.push('Utility token — MiCA whitepaper requirements not applicable.');
    } else if (claimsMicaCompliance === 'YES' && micaCompliant === 'NO') {
      summaryParts.push('Claims MiCA compliance but fails structural check.');
    } else if (claimsMicaCompliance === 'YES' && micaCompliant === 'PARTIAL') {
      summaryParts.push('Claims MiCA compliance but only partially meets requirements.');
    }

    if (micaCompliant === 'NOT_APPLICABLE') {
      // No section count needed for utility tokens
    } else if (micaCompliant === 'YES') {
      summaryParts.push(`All ${foundCount}/7 required MiCA sections present.`);
    } else {
      summaryParts.push(`${foundCount}/7 required MiCA sections found.`);
    }

    if (sectionsMissing.length > 0 && micaCompliant !== 'YES') {
      const missing = sectionsMissing.map((s) => s.replace(/_/g, ' ')).join(', ');
      summaryParts.push(`Missing: ${missing}.`);
    }

    // Caveat: Grey analyzes the discovered/provided document only.
    if (micaCompliant !== 'YES' && micaCompliant !== 'NOT_APPLICABLE') {
      summaryParts.push(
        'Note: analysis based on discovered document only — project may have separate regulatory filings not captured here.',
      );
    }

    return {
      claimsMicaCompliance,
      micaCompliant,
      micaSummary: summaryParts.join(' '),
      micaSectionsFound: sectionsFound,
      micaSectionsMissing: sectionsMissing,
    };
  }

  /**
   * Detect utility tokens (MiCA Article 4(3) exemption).
   * Utility tokens granting access to existing/functioning products are exempt.
   */
  private detectUtilityToken(lowerText: string): boolean {
    const utilityIndicators = [
      /\butility\s+token\b/,
      /\baccess\s+token\b/,
      /\bplatform\s+(?:access|usage|token)\b/,
      /\bno\s+investment\b/,
      /\bnot\s+(?:a\s+)?security\b/,
      /\bgrants?\s+access\s+to\b/,
      /\bservice\s+token\b/,
    ];
    let hits = 0;
    for (const pattern of utilityIndicators) {
      if (pattern.test(lowerText)) hits++;
    }
    // Require at least 2 indicators to avoid false positives
    return hits >= 2;
  }

  private emptyAnalysis(): StructuralAnalysis {
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
        micaSummary: 'Empty document — no MiCA analysis possible.',
        micaSectionsFound: [],
        micaSectionsMissing: [...MICA_REQUIRED_SECTIONS],
      },
    };
  }
}
