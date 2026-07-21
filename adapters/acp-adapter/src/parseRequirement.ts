// ACP NL requirement parser (N2/A6) — ported from plugin-acp AcpService.parseRequirement
// (:1280-1352). Emits a CLEAN { token_address?, project_name? } that keys directly into the
// shared grey-core handlers (legitimacy_scan.ts:10 reads body.token_address / body.project_name;
// subjectMapping resolves either). The WpvService-only `_requirementText`/`_signals`/`raw_instruction`
// stamps are DROPPED (gate-path, not earning). The known-protocol regex is compiled from
// @grey/pipeline's canonical KNOWN_PROTOCOL_NAMES — no third divergent copy.
import { KNOWN_PROTOCOL_NAMES, buildProtocolPattern } from '@grey/pipeline';

const KNOWN_PROTOCOL_PATTERN = buildProtocolPattern(KNOWN_PROTOCOL_NAMES);

/** The clean subject the shared handlers consume. */
export interface ParsedRequirement {
  token_address?: string;
  project_name?: string;
}

export interface ParseResult {
  requirement: ParsedRequirement;
  /** True when the requirement was extracted from plain text rather than structured JSON/object. */
  isPlainText: boolean;
}

/** Extract a project name from a plain-text instruction (3-stage, port of the original). */
function extractProjectName(raw: string): string | undefined {
  // Stage 1: known protocol pattern.
  const protocolMatch = raw.match(KNOWN_PROTOCOL_PATTERN);
  if (protocolMatch) return protocolMatch[0].trim();

  // Stage 2: structural — last capitalized noun phrase before a parenthesized/bracketed address.
  const addrPos = raw.search(/[([]\s*0x[0-9a-fA-F]/);
  if (addrPos > 0) {
    const before = raw.slice(0, addrPos).trim();
    const phrases = [
      ...before.matchAll(
        /(?!(?:Verify|Analyze|Evaluate|Run|Check|Audit|Scan|Review|Perform|Do|Please|The|This|Assess|Inspect|Confirm|Determine|Test)\b)[A-Z][a-zA-Z0-9]*(?:\s+(?:v\d+|V\d+|[A-Z][a-zA-Z0-9]*|Finance|Protocol|Labs|Network|DAO|Exchange|Chain|Token|Bridge))*\b/g,
      ),
    ];
    if (phrases.length > 0) {
      const last = phrases[phrases.length - 1][0].trim();
      if (last.length >= 2) return last;
    }
  }

  // Stage 3: generic name regex after an action verb.
  const nameMatch = raw.match(
    /(?:verify|evaluate|analyze|audit|check|review|scan)\s+([A-Z][a-zA-Z0-9\s.]+?)(?:\s*[([{]|\s*for\s|\s*,|\s*\.(?:\s|$)|\s*Token)/i,
  );
  if (nameMatch) return nameMatch[1].trim();

  return undefined;
}

/**
 * Parse an ACP service requirement into the clean handler subject.
 * - object / JSON string → pass through the recognized fields (structured).
 * - plain text with a 0x address → { token_address, project_name? } (isPlainText).
 * - plain text with only a known protocol name → { project_name } (isPlainText).
 * - unparseable → {} (caller rejects pre-acceptance).
 */
export function parseRequirement(raw: unknown): ParseResult {
  const pick = (obj: Record<string, unknown>): ParsedRequirement => {
    const out: ParsedRequirement = {};
    const token = obj.token_address ?? obj.tokenAddress;
    const name = obj.project_name ?? obj.projectName;
    if (typeof token === 'string' && token.trim()) out.token_address = token.trim();
    if (typeof name === 'string' && name.trim()) out.project_name = name.trim();
    return out;
  };

  if (typeof raw === 'object' && raw !== null) {
    return { requirement: pick(raw as Record<string, unknown>), isPlainText: false };
  }

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return { requirement: pick(parsed as Record<string, unknown>), isPlainText: false };
      }
    } catch {
      // Not JSON — fall through to plain-text extraction.
    }

    const evmMatch = raw.match(/\b(0x[0-9a-fA-F]{10,42})\b/);
    if (evmMatch) {
      const requirement: ParsedRequirement = { token_address: evmMatch[1] };
      const projectName = extractProjectName(raw);
      if (projectName) requirement.project_name = projectName;
      return { requirement, isPlainText: true };
    }

    const projectMatch = raw.match(KNOWN_PROTOCOL_PATTERN);
    if (projectMatch) {
      return { requirement: { project_name: projectMatch[0].trim() }, isPlainText: true };
    }

    return { requirement: {}, isPlainText: true };
  }

  return { requirement: {}, isPlainText: false };
}
