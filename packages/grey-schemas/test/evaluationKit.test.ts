import { describe, it, expect } from 'vitest';
import type { OfferingSlug } from '../src/responses/types';
import {
  buildEvaluationKit,
  buildAllEvaluationKits,
  EVALUATION_KIT_BRANDING,
} from '../src/evaluationKit';

describe('EvaluationKit — Bazaar extension projection (E1-B, Invariant #33)', () => {
  it('projects all 10 offerings with the spec field list', () => {
    const kits = buildAllEvaluationKits();
    expect(kits).toHaveLength(10);
    for (const k of kits) {
      expect(k.discoverable).toBe(true);
      expect(typeof k.description).toBe('string');
      expect(k.outputSchema).toBeTruthy();
      expect(Array.isArray(k.tags)).toBe(true);
      expect(Array.isArray(k.dropped)).toBe(true);
    }
  });

  it('the 7 paid offerings carry an inputSchema; the 2 free resources do not', () => {
    const kit = (slug: OfferingSlug) => buildEvaluationKit(slug);
    expect(kit('legitimacy_scan').inputSchema).toBeTruthy();
    expect(kit('daily_tech_brief').inputSchema).toBeTruthy();
    expect(kit('daily_greenlight_list').inputSchema).toBeNull();
    expect(kit('scam_alert_feed').inputSchema).toBeNull();
  });

  it('carries priceUsd + computeClass from the canonical pricing table (single source)', () => {
    const scan = buildEvaluationKit('legitimacy_scan');
    expect(scan.priceUsd).toBe(0.25);
    expect(scan.computeClass).toBe('LIVE_ALLOWED');

    const facts = buildEvaluationKit('quick_protocol_facts');
    expect(facts.computeClass).toBe('CACHE_ONLY');
  });

  it('priceUsd is null for an unpriced offering (flagged, not invented)', () => {
    const feed = buildEvaluationKit('scam_alert_feed');
    expect(feed.priceUsd).toBeNull();
  });

  it('every branded serviceName/tag/iconUrl passes validation as authored (no drops in the real data)', () => {
    for (const kit of buildAllEvaluationKits()) {
      expect(kit.dropped).toEqual([]);
      expect(kit.serviceName).not.toBeNull();
      expect(kit.iconUrl).not.toBeNull();
    }
  });

  it('soft-drops a non-ASCII serviceName instead of throwing', () => {
    const original = EVALUATION_KIT_BRANDING.legitimacy_scan.serviceName;
    // @ts-expect-error — deliberately mutate the branding table to simulate a bad field for the test
    EVALUATION_KIT_BRANDING.legitimacy_scan.serviceName = 'Légitimacy Scan';
    try {
      const kit = buildEvaluationKit('legitimacy_scan');
      expect(kit.serviceName).toBeNull();
      expect(kit.dropped).toContainEqual({ field: 'serviceName', reason: 'not printable ASCII' });
      // the entry still ships — soft-drop, not a thrown error or a missing listing.
      expect(kit.discoverable).toBe(true);
    } finally {
      // @ts-expect-error — restore
      EVALUATION_KIT_BRANDING.legitimacy_scan.serviceName = original;
    }
  });

  it('soft-drops a non-https iconUrl', () => {
    const original = EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl;
    // @ts-expect-error — deliberate bad value for the test
    EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl = 'http://whitepapergrey.com/icons/x.svg';
    try {
      const kit = buildEvaluationKit('legitimacy_scan');
      expect(kit.iconUrl).toBeNull();
      expect(kit.dropped.some((d) => d.field === 'iconUrl')).toBe(true);
    } finally {
      // @ts-expect-error — restore
      EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl = original;
    }
  });

  it('soft-drops an IP-literal or loopback iconUrl', () => {
    for (const bad of [
      'https://127.0.0.1/icon.svg',
      'https://localhost/icon.svg',
      'https://192.168.1.5/icon.svg',
    ]) {
      const original = EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl;
      // @ts-expect-error — deliberate bad value for the test
      EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl = bad;
      try {
        const kit = buildEvaluationKit('legitimacy_scan');
        expect(kit.iconUrl, bad).toBeNull();
      } finally {
        // @ts-expect-error — restore
        EVALUATION_KIT_BRANDING.legitimacy_scan.iconUrl = original;
      }
    }
  });

  it('soft-drops one bad tag but keeps the rest', () => {
    const original = EVALUATION_KIT_BRANDING.legitimacy_scan.tags;
    // @ts-expect-error — deliberate bad value for the test
    EVALUATION_KIT_BRANDING.legitimacy_scan.tags = ['crypto', 'tïer1', 'verification'];
    try {
      const kit = buildEvaluationKit('legitimacy_scan');
      expect(kit.tags).toEqual(['crypto', 'verification']);
      expect(kit.dropped.some((d) => d.field.startsWith('tags['))).toBe(true);
    } finally {
      // @ts-expect-error — restore
      EVALUATION_KIT_BRANDING.legitimacy_scan.tags = original;
    }
  });
});
