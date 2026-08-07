# CDP Phase 2 — Production Deploy + Discovery Re-check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** PR #38 (merged), remaining plan from `CDP-PHASE2-TASK3-ACCEPTED-push-for-review-KOV-directive.md`.

## Deploy — done, verified live

VPS was on `e028f83`, one merge behind; fast-forwarded to `bd7f44a` (PR #38).

- Lockfile delta was real this time (not just workspace symlinks): `@coinbase/x402`, `@x402/core`, `@coinbase/cdp-sdk` + transitives (~60 packages). `pnpm install --frozen-lockfile`: 2.6s, **zero downloads** — pnpm's store already had everything cached from the earlier Task 3 scratch-checkout verification on this same box.
- Filtered build (`@grey/core...` + `@grey/sweeper...`): 12.2s, clean.
- `sudo systemctl restart grey-core`: clean startup, memory stayed healthy throughout (never below ~440Mi free / 1.1Gi available).
- **Live verification:**
  - `/health` → 200, `/identity` → 200.
  - `POST /v1/cdp/offerings/legitimacy_scan` (no payment) → **402**, route genuinely mounted (didn't exist before this deploy).
  - `POST /v1/offerings/legitimacy_scan` (primary route) → still 402, unaffected — confirms the new route is genuinely additive, not a regression on the existing rail.

## Discovery re-check — real progress, one new precondition surfaced

Re-ran `POST /v2/x402/validate` against the now-live URL. Compared to the pre-deploy check:

| Check | Pre-deploy | Now |
|---|---|---|
| `endpoint_reachable` | ✅ true | ✅ true (unchanged) |
| `returns_402` | ❌ false (404) | ✅ **true** — the deploy fixed exactly what it was supposed to |
| `x402_version` | skipped (cascaded from returns_402) | ❌ **false** — `"Endpoint uses x402 v1 — upgrade to x402 v2 to be discoverable in the bazaar"`, `expected: "2"`, `actual: "1"` |
| everything downstream (`has_accepts`, `accepts[0].*`, `bazaar.*`, `payment_required_header`) | skipped | skipped — cascading from `x402_version` now, not `returns_402` |

`simulation.outcome: "rejected", rejectionReason: "endpoint uses x402 v1; upgrade to x402 v2 for bazaar discovery"`.

**What this means, precisely:** the CDP-routed route's *settlement call* to CDP already uses CDP's live v2 wire shape internally (`cdpFacilitator.ts`'s `toCdpPaymentRequirements`/`toCdpPaymentPayload`) — that part's proven, Task 3's real Base Sepolia settlement succeeded on exactly this. But the route's **buyer-facing 402 challenge** — what a prospective payer or CDP's own crawler actually sees when it hits `/v1/cdp/offerings/<slug>` — is still Grey's existing v1-shaped `PaymentRequirements` body (`buildPaymentRequirements`, unchanged, by design — "buyer-facing wire format is UNCHANGED" was an explicit Phase 2 design choice). CDP's validator is telling us Bazaar discoverability specifically requires the **outward-facing 402 response itself** to be v2-shaped (a different envelope — `has_accepts`/`accepts[0].shape` and a `payment_required_header` check that isn't relevant to v1's plain-JSON-body approach), not just that Grey talks v2 to CDP internally.

This is new information Phase 2's original scope didn't anticipate — the directive asked for a route that *settles through CDP*, not one that *also serves a v2-shaped challenge*. I haven't touched the challenge/402 response code for this route; wanted to report this precisely rather than redesign it unilaterally, since it's a real scope/design decision (a second challenge-builder alongside `buildPaymentRequirements`, v1 vs v2 envelope choice, whether this affects the primary route too eventually) worth your call rather than mine.

## Status

- Deploy: done, live, verified — nothing further needed there.
- E1→E2 gate's Bazaar-indexing leg: still not closed. Concretely closer (reachability + 402 both now pass), but blocked on the v2-challenge-format gap above, not a deploy or settlement problem anymore.
