// Pattern 4b (M3 FDQ ratification): field-name / structural drift guard between the request
// JSON Schemas (src/requests/v1/*.schema.json) and the canonical hand-authored request
// interfaces (src/requests/types.ts). Two mechanisms (mirrors enum-drift.test.ts):
//  (a) runtime — Object.keys(schema.properties) must equal a const-tuple key mirror;
//  (b) compile-time — `as const satisfies readonly (keyof Interface)[]` (mirror ⊆ interface)
//      + `Exclude<keyof Interface, mirror[number]> extends never` (interface ⊆ mirror).
// Transitively (a)+(b): schema properties ≡ keyof Interface. A schema edit not mirrored in
// the interface (or vice versa) fails the test and/or typecheck, naming the drifted side.
// Plus a validator round-trip on the per-offering valid/invalid fixtures.
//
// Covers the 8 PAID offerings only (FDQ-10) — the 2 free GETs take no request body.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { offeringRequestValidators } from '../src/validators';
import type { PaidOfferingSlug } from '../src/responses/types';
import type {
  LegitimacyScanRequest,
  LegitimacyScanTrustRungRequest,
  VerifyWhitepaperRequest,
  VerifyFullTechRequest,
  DailyTechBriefRequest,
  ClaimHistoryRequest,
  QuickProtocolFactsRequest,
  ClaimExtractionRequest,
} from '../src/requests/types';

const here = dirname(fileURLToPath(import.meta.url));
const reqSchema = (slug: string): { properties: Record<string, unknown> } =>
  JSON.parse(readFileSync(join(here, '..', 'src', 'requests', 'v1', `${slug}.schema.json`), 'utf8'));
// Request fixtures live at test/fixtures/requests/<slug>/ — deliberately NOT under
// test/fixtures/v1/, because the frozen validators.test.ts does readdirSync(fixtures/v1) and
// treats every subdir as an offering slug. (Internal-impl relocation; PHASE-A-PROGRESS notes it.)
const fixture = (slug: string, kind: 'valid' | 'invalid'): unknown =>
  JSON.parse(readFileSync(join(here, 'fixtures', 'requests', slug, `${kind}.json`), 'utf8'));

// ── (b) compile-time key mirrors with exhaustiveness guards ──
const legitimacyScanKeys = ['token_address', 'project_name'] as const satisfies readonly (keyof LegitimacyScanRequest)[];
type _CkLegit = Exclude<keyof LegitimacyScanRequest, (typeof legitimacyScanKeys)[number]> extends never ? true : never;
const _ckLegit: _CkLegit = true;

const legitimacyScanTrustRungKeys = ['token_address', 'project_name'] as const satisfies readonly (keyof LegitimacyScanTrustRungRequest)[];
type _CkTrustRung = Exclude<keyof LegitimacyScanTrustRungRequest, (typeof legitimacyScanTrustRungKeys)[number]> extends never ? true : never;
const _ckTrustRung: _CkTrustRung = true;

const verifyWhitepaperKeys = ['token_address', 'project_name', 'document_url'] as const satisfies readonly (keyof VerifyWhitepaperRequest)[];
type _CkVw = Exclude<keyof VerifyWhitepaperRequest, (typeof verifyWhitepaperKeys)[number]> extends never ? true : never;
const _ckVw: _CkVw = true;

const verifyFullTechKeys = ['token_address', 'project_name', 'document_url'] as const satisfies readonly (keyof VerifyFullTechRequest)[];
type _CkVft = Exclude<keyof VerifyFullTechRequest, (typeof verifyFullTechKeys)[number]> extends never ? true : never;
const _ckVft: _CkVft = true;

const dailyTechBriefKeys = ['date'] as const satisfies readonly (keyof DailyTechBriefRequest)[];
type _CkDtb = Exclude<keyof DailyTechBriefRequest, (typeof dailyTechBriefKeys)[number]> extends never ? true : never;
const _ckDtb: _CkDtb = true;

const claimHistoryKeys = ['projectIdentifier'] as const satisfies readonly (keyof ClaimHistoryRequest)[];
type _CkCh = Exclude<keyof ClaimHistoryRequest, (typeof claimHistoryKeys)[number]> extends never ? true : never;
const _ckCh: _CkCh = true;

const quickProtocolFactsKeys = ['projectQuery'] as const satisfies readonly (keyof QuickProtocolFactsRequest)[];
type _CkQpf = Exclude<keyof QuickProtocolFactsRequest, (typeof quickProtocolFactsKeys)[number]> extends never ? true : never;
const _ckQpf: _CkQpf = true;

const claimExtractionKeys = ['whitepaperUrl'] as const satisfies readonly (keyof ClaimExtractionRequest)[];
type _CkCe = Exclude<keyof ClaimExtractionRequest, (typeof claimExtractionKeys)[number]> extends never ? true : never;
const _ckCe: _CkCe = true;

const mirrors: Record<PaidOfferingSlug, readonly string[]> = {
  legitimacy_scan: legitimacyScanKeys,
  legitimacy_scan_trust_rung: legitimacyScanTrustRungKeys,
  verify_whitepaper: verifyWhitepaperKeys,
  verify_full_tech: verifyFullTechKeys,
  daily_tech_brief: dailyTechBriefKeys,
  claim_history: claimHistoryKeys,
  quick_protocol_facts: quickProtocolFactsKeys,
  claim_extraction: claimExtractionKeys,
};

const paidSlugs = Object.keys(mirrors) as PaidOfferingSlug[];

describe('request-field-drift (Pattern 4b): schema properties ≡ keyof Interface', () => {
  it('compile-time mirror guards hold', () => {
    expect([_ckLegit, _ckTrustRung, _ckVw, _ckVft, _ckDtb, _ckCh, _ckQpf, _ckCe]).toEqual([
      true, true, true, true, true, true, true, true,
    ]);
  });

  it.each(paidSlugs)('%s: schema.properties keys match the interface key mirror', (slug) => {
    const schemaKeys = Object.keys(reqSchema(slug).properties).sort();
    expect(schemaKeys).toEqual([...mirrors[slug]].sort());
  });
});

describe('request validators round-trip fixtures', () => {
  it.each(paidSlugs)('%s: accepts valid, rejects invalid', (slug) => {
    const validate = offeringRequestValidators[slug];
    expect(validate, `no request validator for ${slug}`).toBeTruthy();
    const okValid = validate(fixture(slug, 'valid'));
    expect(okValid, JSON.stringify(validate.errors)).toBe(true);
    const okInvalid = validate(fixture(slug, 'invalid'));
    expect(okInvalid).toBe(false);
    expect(validate.errors?.length ?? 0).toBeGreaterThan(0);
  });
});
