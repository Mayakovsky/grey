// M3.5 (FDQ-1): guards for the additive request-side taxonomy authored in src/requests/types.ts —
// `ComputeOfferingSlug` (the 4 cache-or-live offerings) and `RequestFor<O>` (paid slug → request
// interface). Mirrors the ResponseFor<O> precedent. Compile-time assertions are the real test
// (they fail typecheck under tsconfig.test.json); the runtime expect() keeps vitest counting them.
import { describe, it, expect } from 'vitest';
import type { PaidOfferingSlug } from '../src/responses/types';
import type {
  ComputeOfferingSlug,
  RequestFor,
  LegitimacyScanRequest,
  VerifyWhitepaperRequest,
  VerifyFullTechRequest,
  ClaimExtractionRequest,
  ClaimHistoryRequest,
  QuickProtocolFactsRequest,
  DailyTechBriefRequest,
} from '../src/requests/types';

// type-level equality helper
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : never;

describe('M3.5 FDQ-1 — ComputeOfferingSlug', () => {
  it('is a subset of PaidOfferingSlug (every compute slug is a paid slug)', () => {
    // compile-time: assignable to PaidOfferingSlug ⇒ ComputeOfferingSlug ⊆ PaidOfferingSlug
    const _subset: PaidOfferingSlug = 'legitimacy_scan' as ComputeOfferingSlug;
    // exhaustiveness: exactly the 4 cache-or-live offerings
    const all = [
      'legitimacy_scan',
      'verify_whitepaper',
      'verify_full_tech',
      'claim_extraction',
    ] as const satisfies readonly ComputeOfferingSlug[];
    type _Exhaustive = Exclude<ComputeOfferingSlug, (typeof all)[number]> extends never ? true : never;
    const _ck: _Exhaustive = true;
    expect(all).toHaveLength(4);
    expect(_subset).toBe('legitimacy_scan');
    expect(_ck).toBe(true);
  });
});

describe('M3.5 FDQ-1 — RequestFor<O>', () => {
  it('maps each paid offering slug to its request interface', () => {
    // compile-time: each mapping resolves to the exact hand-authored interface
    const _legit: Equals<RequestFor<'legitimacy_scan'>, LegitimacyScanRequest> = true;
    const _vw: Equals<RequestFor<'verify_whitepaper'>, VerifyWhitepaperRequest> = true;
    const _vft: Equals<RequestFor<'verify_full_tech'>, VerifyFullTechRequest> = true;
    const _ce: Equals<RequestFor<'claim_extraction'>, ClaimExtractionRequest> = true;
    const _ch: Equals<RequestFor<'claim_history'>, ClaimHistoryRequest> = true;
    const _qpf: Equals<RequestFor<'quick_protocol_facts'>, QuickProtocolFactsRequest> = true;
    const _dtb: Equals<RequestFor<'daily_tech_brief'>, DailyTechBriefRequest> = true;

    // a sample compute-offering value typed via RequestFor is shaped correctly at runtime
    const sample: RequestFor<'legitimacy_scan'> = { token_address: '0xabc' };
    expect(sample.token_address).toBe('0xabc');
    expect([_legit, _vw, _vft, _ce, _ch, _qpf, _dtb]).toEqual([true, true, true, true, true, true, true]);
  });
});
