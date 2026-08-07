# CDP Phase 2 — Production Deploy + Validator Re-check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** PR #39 (merged), remaining plan from prior reports.

## Deploy — done, verified live

VPS was on `bd7f44a`, one merge behind; fast-forwarded to `2df2c24` (PR #39, all 3 commits). No lockfile changes. Filtered build: 13.7s, clean. `sudo systemctl restart grey-core`: clean startup, memory stayed healthy throughout (never below ~373Mi free / 1.1Gi available).

Live verification:
- `/health` → 200, `/identity` → 200.
- `POST /v1/cdp/offerings/legitimacy_scan` (no payment) → **402, empty JSON body, `PAYMENT-REQUIRED` response header carrying the full v2 payload** — exactly the shape this whole revision was built for, confirmed live, not just in tests.
- `POST /v1/offerings/legitimacy_scan` (primary route) → still 402 with the v1 JSON body, unaffected — confirms the split held in production, not just in code review.

## Validator re-check — major progress, one specific failure remains

Re-ran `POST /v2/x402/validate` against the live CDP-routed URL. Compared to before this whole v2-challenge effort started:

| Then | Now |
|---|---|
| `endpoint_reachable`, `returns_402` only — everything else skipped, cascading from `x402_version` | **18 of 19 required checks pass**: `x402_version`, `payment_required_header` ("PaymentRequired delivered via the PAYMENT-REQUIRED response header" — exact match), `has_accepts`, `accepts[0].scheme/network/asset/amount/payTo/maxTimeoutSeconds`, `has_resource`, `has_bazaar_extension`, `bazaar.info`, `bazaar.info.input.*`, `bazaar.schema` — all pass. |
| — | Only **`parse`** fails: `"v2 discovery extension validation failed: [(root): token_address is required (root): Additional property input is not allowed (root): Additional property output is not allowed]"` |

`valid: false` overall (one required check still failing), so `discovery/merchant?payTo=...` still shows `total: 0` — not yet indexed.

**What the error is telling us, precisely (not yet acted on):** the object CDP is validating has `input`/`output` properties but no `token_address`, and it's being checked against a schema that requires `token_address` and disallows extra properties. That description exactly matches `extensions.bazaar.info` (`{input, output}`, protocol/HTTP metadata) being validated against `extensions.bazaar.schema` (my request-body JSON Schema, which requires `token_address`). I built `bazaar.info` and `bazaar.schema` as two **siblings** under `extensions.bazaar` (matching the shape Phase 1's `buildCdpBazaarExtension` already used for the primary route's `extensions.bazaar` field). CDP's `parse` step appears to expect a different relationship between the two — possibly `schema` nested *under* `info` rather than beside it, or some other structural difference I haven't pinned down. I don't have enough to say which, confidently, without more research (the same "pull the spec first, don't whack-a-mole the validator" discipline as the last round) — flagging precisely rather than guessing at a fix.

## Status

- Deploy: done, live, verified — nothing further needed there.
- Bazaar indexing: not yet closed, but the gap is now narrow and specific — one schema-nesting question in the `bazaar` extension shape, not a protocol-version or header-name problem anymore.
