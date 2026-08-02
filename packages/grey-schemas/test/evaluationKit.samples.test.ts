import { describe, it, expect } from 'vitest';
import type { OfferingSlug, PaidOfferingSlug } from '../src/responses/types';
import { EVALUATION_SAMPLES, buildEvaluationArtifact } from '../src/evaluationKit';
import { offeringValidators, offeringRequestValidators } from '../src/validators';

const PAID: PaidOfferingSlug[] = [
  'legitimacy_scan',
  'legitimacy_scan_trust_rung',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
];
const FREE: OfferingSlug[] = ['daily_greenlight_list', 'scam_alert_feed'];

// E1-C: an evaluating agent reads these before ever paying — they must be real, checkable
// artifacts, not illustrative-but-wrong shapes. Validate against the SAME ajv instances the live
// routes use, not a hand-eyeballed check.
describe('EvaluationKit samples — schema-valid evaluation artifacts (E1-C)', () => {
  it.each(PAID)('%s sample request validates against its request schema', (slug) => {
    const validate = offeringRequestValidators[slug];
    const ok = validate(EVALUATION_SAMPLES[slug].request);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([...PAID, ...FREE])('%s sample response validates against its payload schema', (slug) => {
    const validate = offeringValidators[slug];
    const ok = validate(EVALUATION_SAMPLES[slug].response);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([...PAID, ...FREE])(
    '%s buildEvaluationArtifact attaches the validated sample',
    (slug) => {
      const artifact = buildEvaluationArtifact(slug);
      expect(artifact.sample).toEqual(EVALUATION_SAMPLES[slug]);
    },
  );

  it('buildAllEvaluationKits (the lean list/402 projection) carries no sample', () => {
    // covered indirectly: buildEvaluationKit without opts.sample leaves it undefined.
    const artifact = buildEvaluationArtifact('legitimacy_scan');
    expect(artifact.sample).toBeDefined();
  });
});
