// quick_protocol_facts (cache-only). Resolve from `projectQuery`; report the cached headline
// verdict + MiCA status. Miss → NOT_IN_DATABASE; ingested-but-unverified → INSUFFICIENT_DATA.
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { iso, micaFrom } from '../orchestration/cacheRead';

export const quickProtocolFacts: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { projectQuery?: string };
  const q = body.projectQuery ?? '';
  const wp = await resolveWhitepaper(deps.whitepapers, { identifier: q });
  const subject = subjectFrom(wp, { tokenAddress: null, projectName: q });

  if (!wp) {
    return {
      payload: {
        project: { query: q },
        type: null,
        miCAStatus: null,
        headlineVerdict: 'NOT_IN_DATABASE',
        lastVerified: null,
        sources: [],
        note: 'not yet verified — submit a verify_whitepaper or verify_full_tech job to add this project to the cache',
      },
      subject,
      cacheHit: false,
    };
  }

  const sources = wp.documentUrl ? [{ type: 'whitepaper', url: wp.documentUrl }] : [];
  const v = await deps.verifications.findByWhitepaperId(wp.id);
  const project = { name: wp.projectName, tokenAddress: wp.tokenAddress, whitepaperUrl: wp.documentUrl };

  if (!v) {
    return {
      payload: {
        project,
        type: null,
        miCAStatus: null,
        headlineVerdict: 'INSUFFICIENT_DATA',
        lastVerified: null,
        sources,
        note: 'whitepaper ingested but no verification record',
      },
      subject,
      cacheHit: false,
    };
  }

  return {
    payload: {
      project,
      type: null,
      miCAStatus: micaFrom(v).micaCompliant,
      headlineVerdict: v.verdict ?? 'INSUFFICIENT_DATA',
      lastVerified: iso(v.verifiedAt),
      sources,
      note: null,
    },
    subject,
    cacheHit: true,
  };
};
