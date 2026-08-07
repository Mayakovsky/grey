# CDP PHASE 2 — POLISH: FIX STALE X-PAYMENT REFERENCES IN decodeCdpPaymentPayload

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Trivial, same PR #39 — no new branch, no new PR.

`decodeCdpPaymentPayload` in `cdpFacilitator.ts` still references the old header name in two places, missed when the call sites were fixed:

1. Its JSDoc: "Decodes a buyer's X-PAYMENT header..." → should say `PAYMENT-SIGNATURE`.
2. Its malformed-input error string: `'X-PAYMENT is not valid base64 JSON'` → should say `PAYMENT-SIGNATURE`, since that's the actual header a real caller's error would be about.

Fix both, re-export `review-cdp-v2-challenge.diff` (overwrite), confirm gate still green. Report back once done — no need for a fresh round of manual verification, this doesn't touch behavior.
