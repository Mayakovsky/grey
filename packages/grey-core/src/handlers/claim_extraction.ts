// claim_extraction (M3.5 live). The request is a `whitepaperUrl` only and there is no repo
// lookup-by-URL (Q5) — so there is no cache-read step; it always runs live via cacheOrLive, which
// fetches+ingests the URL (dedupe-on-address upsert) and returns the bespoke ClaimExtraction
// deliverable. The pre-run subject is unresolvable from a URL (subjectMapping.ts:15), so the
// envelope subject is derived from the POST-run whitepaper row inside cacheOrLive.
import type { OfferingHandler } from './types';
import type { RequestFor } from '@grey/schemas';
import { cacheOrLive } from '../orchestration/cacheOrLive';

export const claimExtraction: OfferingHandler = async (input, deps) =>
  cacheOrLive('claim_extraction', (input.requirement ?? {}) as RequestFor<'claim_extraction'>, deps);
