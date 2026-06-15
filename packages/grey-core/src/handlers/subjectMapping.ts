// @grey/core subject mapping (FDQ-2). The M2.5 envelope's subject is {tokenAddress, projectName},
// but request fields are heterogeneous (token_address/project_name, projectIdentifier,
// projectQuery, whitepaperUrl). This helper resolves a request's identifiers to a cached
// whitepaper (the same lookup the cache-read needs) and derives the envelope subject from it.
// (Extracted helper rather than inlined per-handler — Pattern 1 Tier B call; reused by 6 handlers.)
import type { HandlerDeps } from '../deps';
import type { WhitepaperRow } from './types';
import type { EnvelopeSubject } from '../envelope/build';

const TOKEN_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Resolve a whitepaper from heterogeneous identifier hints. Tries explicit token, then explicit
 * project name, then a loose `identifier` as either. Returns null if none resolve (e.g. a
 * whitepaperUrl, which has no repo lookup — claim_extraction is therefore always a miss in M3).
 */
export async function resolveWhitepaper(
  whitepapers: HandlerDeps['whitepapers'],
  hints: { tokenAddress?: string; projectName?: string; identifier?: string },
): Promise<WhitepaperRow | null> {
  const byToken = async (addr?: string): Promise<WhitepaperRow | null> => {
    const a = addr?.trim();
    if (a && TOKEN_RE.test(a)) return (await whitepapers.findByTokenAddress(a))[0] ?? null;
    return null;
  };
  const byName = async (name?: string): Promise<WhitepaperRow | null> => {
    const n = name?.trim();
    if (n) return (await whitepapers.findByProjectName(n))[0] ?? null;
    return null;
  };
  return (
    (await byToken(hints.tokenAddress)) ??
    (await byName(hints.projectName)) ??
    (await byToken(hints.identifier)) ??
    (await byName(hints.identifier)) ??
    null
  );
}

/** Derive the envelope subject from a resolved whitepaper (cache hit) or the request fallback. */
export function subjectFrom(
  wp: WhitepaperRow | null,
  fallback: { tokenAddress?: string | null; projectName?: string },
): EnvelopeSubject {
  return {
    tokenAddress: wp?.tokenAddress ?? fallback.tokenAddress ?? null,
    projectName: wp?.projectName ?? fallback.projectName ?? '',
  };
}
