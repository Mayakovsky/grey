// @grey/schemas/evaluationKit — hand-authored branding data, ONCE (Invariant #33). Icon assets are
// served from the live domain (openapi.yaml's `servers[0]`); tags are printable-ASCII, lowercase,
// hyphenless-safe words per the Bazaar validation rule (E1-B).
import type { OfferingSlug } from '../responses/types';
import type { EvaluationKitBranding } from './types';

const ICON_BASE = 'https://whitepapergrey.com/icons';

export const EVALUATION_KIT_BRANDING: Record<OfferingSlug, EvaluationKitBranding> = {
  legitimacy_scan: {
    serviceName: 'Project Legitimacy Scan',
    tags: ['crypto', 'due-diligence', 'verification', 'tier1'],
    description: 'Fast structural + claims legitimacy read on a token project, cache-or-live.',
    iconUrl: `${ICON_BASE}/legitimacy_scan.svg`,
  },
  verify_whitepaper: {
    serviceName: 'Whitepaper Verification',
    tags: ['crypto', 'due-diligence', 'verification', 'tokenomics'],
    description: 'Tokenomics-focused audit of a project whitepaper against its stated claims.',
    iconUrl: `${ICON_BASE}/verify_whitepaper.svg`,
  },
  verify_full_tech: {
    serviceName: 'Full Technical Verification',
    tags: ['crypto', 'due-diligence', 'verification', 'technical'],
    description: 'Complete technical + tokenomics verification, the deepest tier Grey offers.',
    iconUrl: `${ICON_BASE}/verify_full_tech.svg`,
  },
  claim_extraction: {
    serviceName: 'Claim Extraction',
    tags: ['crypto', 'nlp', 'extraction'],
    description: 'Extracts structured, categorised claims from a buyer-supplied whitepaper URL.',
    iconUrl: `${ICON_BASE}/claim_extraction.svg`,
  },
  claim_history: {
    serviceName: 'Claim History',
    tags: ['crypto', 'due-diligence', 'history'],
    description: 'Prior extracted claims + verification history for a known project.',
    iconUrl: `${ICON_BASE}/claim_history.svg`,
  },
  quick_protocol_facts: {
    serviceName: 'Quick Protocol Facts',
    tags: ['crypto', 'lookup', 'cache-only'],
    description: 'Cache-only fast facts lookup for a known protocol — no live compute.',
    iconUrl: `${ICON_BASE}/quick_protocol_facts.svg`,
  },
  daily_tech_brief: {
    serviceName: 'Daily Technical Briefing',
    tags: ['crypto', 'digest', 'cache-only'],
    description: 'Daily aggregated digest of recently verified projects.',
    iconUrl: `${ICON_BASE}/daily_tech_brief.svg`,
  },
  daily_greenlight_list: {
    serviceName: 'Daily Greenlight List',
    tags: ['crypto', 'digest', 'free'],
    description: 'Free daily list of projects clearing Grey verification.',
    iconUrl: `${ICON_BASE}/daily_greenlight_list.svg`,
  },
  scam_alert_feed: {
    serviceName: 'Scam Alert Feed',
    tags: ['crypto', 'safety', 'free'],
    description: 'Free feed of projects flagged by Grey verification as high-risk.',
    iconUrl: `${ICON_BASE}/scam_alert_feed.svg`,
  },
};
