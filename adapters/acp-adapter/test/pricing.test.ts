import { describe, it, expect } from 'vitest';
import { priceUsdForAcp } from '../src/pricing.js';

// E1-A: ACP resolves its own channel multiplier (1.00×, grandfathered) against the canonical
// table in @grey/schemas/pricing — same values as before, now derived rather than hardcoded.
const EXPECTED: Record<string, number> = {
  legitimacy_scan: 0.25,
  verify_whitepaper: 1.5,
  verify_full_tech: 3.0,
  claim_extraction: 0.75,
  claim_history: 0.25,
  quick_protocol_facts: 0.3,
  daily_tech_brief: 8.0,
};

describe('priceUsdForAcp — ACP adapter boundary price resolution (Invariant #31)', () => {
  it.each(Object.entries(EXPECTED))(
    '%s resolves to the grandfathered 1.00× canonical price',
    (slug, usd) => {
      expect(priceUsdForAcp(slug as never)).toBe(usd);
    },
  );
});
