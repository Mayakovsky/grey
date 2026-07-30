// @grey/schemas/evaluationKit — the projector (E1-B). Merges branding data + the canonical
// pricing table + the raw JSON Schemas into the Bazaar extension shape, applying the stated
// validation rules with SOFT-DROP semantics: a bad field is omitted from the entry (and recorded
// in `dropped`, so it's inspectable rather than truly silent) instead of throwing or blocking the
// whole listing.
import type { OfferingSlug, PaidOfferingSlug } from '../responses/types';
import { computeClassFor, canonicalUsdFor, PRICING_TABLE } from '../pricing/table';
import { EVALUATION_KIT_BRANDING } from './data';
import type { DroppedField, EvaluationKitEntry, SampleExchange } from './types';

import legitimacyScanResponse from '../responses/v1/legitimacy_scan.schema.json';
import verifyWhitepaperResponse from '../responses/v1/verify_whitepaper.schema.json';
import verifyFullTechResponse from '../responses/v1/verify_full_tech.schema.json';
import claimExtractionResponse from '../responses/v1/claim_extraction.schema.json';
import claimHistoryResponse from '../responses/v1/claim_history.schema.json';
import quickProtocolFactsResponse from '../responses/v1/quick_protocol_facts.schema.json';
import dailyTechBriefResponse from '../responses/v1/daily_tech_brief.schema.json';
import dailyGreenlightListResponse from '../responses/v1/daily_greenlight_list.schema.json';
import scamAlertFeedResponse from '../responses/v1/scam_alert_feed.schema.json';

import legitimacyScanRequest from '../requests/v1/legitimacy_scan.schema.json';
import verifyWhitepaperRequest from '../requests/v1/verify_whitepaper.schema.json';
import verifyFullTechRequest from '../requests/v1/verify_full_tech.schema.json';
import claimExtractionRequest from '../requests/v1/claim_extraction.schema.json';
import claimHistoryRequest from '../requests/v1/claim_history.schema.json';
import quickProtocolFactsRequest from '../requests/v1/quick_protocol_facts.schema.json';
import dailyTechBriefRequest from '../requests/v1/daily_tech_brief.schema.json';

const OUTPUT_SCHEMAS: Record<OfferingSlug, object> = {
  legitimacy_scan: legitimacyScanResponse,
  verify_whitepaper: verifyWhitepaperResponse,
  verify_full_tech: verifyFullTechResponse,
  claim_extraction: claimExtractionResponse,
  claim_history: claimHistoryResponse,
  quick_protocol_facts: quickProtocolFactsResponse,
  daily_tech_brief: dailyTechBriefResponse,
  daily_greenlight_list: dailyGreenlightListResponse,
  scam_alert_feed: scamAlertFeedResponse,
};

const INPUT_SCHEMAS: Record<PaidOfferingSlug, object> = {
  legitimacy_scan: legitimacyScanRequest,
  verify_whitepaper: verifyWhitepaperRequest,
  verify_full_tech: verifyFullTechRequest,
  claim_extraction: claimExtractionRequest,
  claim_history: claimHistoryRequest,
  quick_protocol_facts: quickProtocolFactsRequest,
  daily_tech_brief: dailyTechBriefRequest,
};

const FREE_SLUGS = new Set<OfferingSlug>(['daily_greenlight_list', 'scam_alert_feed']);

/** Printable ASCII only (0x20–0x7E) — the Bazaar validation rule for serviceName/tags. */
function isPrintableAscii(s: string): boolean {
  return s.length > 0 && /^[\x20-\x7E]+$/.test(s);
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
// https://<host>[:<port>][/...] — deliberately hand-parsed (not the global `URL`) so this package
// stays node-ambient-free (no "types": ["node"] opt-in, unlike the adapter packages).
const HTTPS_URL_RE = /^https:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#]|$)/;

/** Absolute https, no IP literal, no loopback host — the Bazaar validation rule for iconUrl. */
function isValidIconUrl(url: string): boolean {
  const m = HTTPS_URL_RE.exec(url);
  if (!m) return false;
  const rawHost = m[1]!;
  if (rawHost.startsWith('[')) return false; // bracketed IPv6 literal
  const host = rawHost.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return false;
  if (IPV4_RE.test(host)) return false;
  return true;
}

/**
 * Project one offering into the Bazaar extension shape. Soft-drop: a bad serviceName/tag/iconUrl
 * is omitted (null / filtered) rather than thrown — the entry still ships, just without that
 * field, matching the spec's own description of Bazaar's indexing behaviour.
 */
export function buildEvaluationKit(
  slug: OfferingSlug,
  opts: { sample?: SampleExchange } = {},
): EvaluationKitEntry {
  const branding = EVALUATION_KIT_BRANDING[slug];
  const pricing = PRICING_TABLE[slug];
  const dropped: DroppedField[] = [];

  let serviceName: string | null = branding.serviceName;
  if (!isPrintableAscii(branding.serviceName)) {
    dropped.push({ field: 'serviceName', reason: 'not printable ASCII' });
    serviceName = null;
  }

  const tags: string[] = [];
  for (const tag of branding.tags) {
    if (isPrintableAscii(tag)) {
      tags.push(tag);
    } else {
      dropped.push({ field: `tags[${tag}]`, reason: 'not printable ASCII' });
    }
  }

  let iconUrl: string | null = branding.iconUrl;
  if (!isValidIconUrl(branding.iconUrl)) {
    dropped.push({
      field: 'iconUrl',
      reason: 'not an absolute https URL, or an IP/loopback literal',
    });
    iconUrl = null;
  }

  const inputSchema = FREE_SLUGS.has(slug)
    ? null
    : (INPUT_SCHEMAS[slug as PaidOfferingSlug] ?? null);

  return {
    slug,
    discoverable: true,
    serviceName,
    tags,
    description: branding.description,
    inputSchema,
    outputSchema: OUTPUT_SCHEMAS[slug],
    iconUrl,
    priceUsd: pricing.canonicalUsd === null ? null : canonicalUsdFor(slug),
    computeClass: computeClassFor(slug),
    sample: opts.sample,
    dropped,
  };
}

/** Project every offering. Callers filter on `discoverable`/`priceUsd !== null` as needed — this
 *  function does not itself decide what a channel should list (E1-C's disable flag is separate). */
export function buildAllEvaluationKits(): EvaluationKitEntry[] {
  return (Object.keys(EVALUATION_KIT_BRANDING) as OfferingSlug[]).map((slug) =>
    buildEvaluationKit(slug),
  );
}
