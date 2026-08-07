# CDP Phase 2 — v2-Shaped Challenge, CDP Route Only — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-v2-challenge-CDP-route-only-KOV-directive.md`.

## Task 1 — spec, pulled up front

CDP's own docs (`docs.cdp.coinbase.com/x402/bazaar`) confirm the `accepts[]` field names (`scheme, network, amount, asset, payTo`, optionally `maxTimeoutSeconds`) but explicitly don't specify the server-side 402 response wire format — that came from `@x402/core`'s own compiled source instead, per the directive's suggestion. The load-bearing find, verbatim from its resource-server code:

> `"Create HTTP payment required response (v1 puts in body, v2 puts in header)"`

This resolves the `payment_required_header` mystery precisely: v2 does **not** put `PaymentRequired` in the JSON body at all — body is `{}`. Instead the full payload (base64 JSON, same encoding style as `X-PAYMENT`) goes in a `PAYMENT-REQUIRED` response header. Settlement success uses `PAYMENT-RESPONSE` (not `X-PAYMENT-RESPONSE`). The buyer's inbound header name is unchanged — `X-PAYMENT` in both versions.

Full shapes used (from `@x402/core/types`, already a dependency):
- `PaymentRequirements` (per-`accepts[]` entry): `{scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra}`.
- `PaymentRequired` (the full 402 payload): `{x402Version, error?, resource: {url, description?, mimeType?, serviceName?, tags?, iconUrl?}, accepts: PaymentRequirements[], extensions?}`.
- `extra.credentialTypes: ["authorization"]` on `"exact"`-scheme entries — not in any doc, taken from CDP's own live discovery data (empirical, flagged as such in the code comment).

## Task 2 — built, CDP route only

All in `adapters/x402-middleware/src/cdpFacilitator.ts` — `challenge.ts`'s `buildPaymentRequirements` (v1) and the primary/trust-rung routes are untouched:

- `buildCdpPaymentRequirementsEntry` — the single `accepts[]` entry, reused identically for both the challenge and the verify/settle call (so what's advertised and what's checked can never drift).
- `buildCdpChallenge` — the full v2 `PaymentRequired` body, Bazaar metadata via the already-shared `buildCdpBazaarExtension` (same EvaluationKit source the primary route uses — read-only reuse, not a modification).
- `sendCdpChallenge` — sets the `PAYMENT-REQUIRED` header via `@x402/core/http`'s own `encodePaymentRequiredHeader`, sends `{}` as the body, matching the reference implementation exactly.
- `decodeCdpPaymentPayload` — decodes the buyer's `X-PAYMENT` as v2-native (`{x402Version:2, accepted, payload}`), replacing `decodePaymentHeader` (v1) **for this route only**.
- `verifyAndSettleViaCdp` — simplified: takes an already-v2 `requirements`/`payload` pair directly. The v1→v2 translation it used to do is gone — a v2-native buyer signs against this route's v2 `accepts[]` entry from the start, so there's nothing left to translate. Your call, per the directive, and this was the cleaner shape: fewer moving parts, no double-building of the requirements object.
- Success response now sets `PAYMENT-RESPONSE` (via `encodePaymentResponseHeader`) instead of `X-PAYMENT-RESPONSE`.

## Task 3 — primary route, informational only (done first, alongside Task 1)

```
GET/POST /v2/x402/validate against https://api.whitepapergrey.com/v1/offerings/legitimacy_scan
```
Hits the identical wall, identical reason: `endpoint_reachable: true`, `returns_402: true`, `x402_version: false` (`"actual":"1"`), `payment_required_header` skipped downstream of that. Confirmed, as predicted — shares `buildPaymentRequirements`. No action taken, per the scope ruling.

## Verify

Can't be run for real yet — CDP's validator needs a public HTTPS URL, and this branch isn't deployed (same situation Task 3 was in last time, before that PR merged). Deferred to post-merge-and-deploy, same two-step pattern as before.

## Deliver

- Full gate: `turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core` + `@grey/acp-adapter`, forced/no-cache — **14/14 green**.
- 25 tests in `cdpFacilitator.test.ts` (up from 21): new `buildCdpChallenge` coverage, the simplified `verifyAndSettleViaCdp` signature, `PAYMENT-REQUIRED`/`PAYMENT-RESPONSE` header assertions (and their absence from the old `X-PAYMENT-RESPONSE` name), a new test proving a well-formed **v1**-shaped payload now correctly 402s on this route (v2-only, by design).
- `review-cdp-v2-challenge.diff` exported at the repo root (666 lines, `main..cdp-phase2-v2-challenge`).
- **[PR #39](https://github.com/Mayakovsky/grey/pull/39)** — `cdp-phase2-v2-challenge` → `main`. Not merged.

## Remaining plan

1. This PR reviewed, merged (Forces' call).
2. Deploy, same process as before.
3. Re-run `/validate` against the live CDP-routed URL — confirm `x402_version` clears and see what (if anything) surfaces next.
