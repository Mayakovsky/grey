# CDP INDEXING — REAL RESOLUTION FOUND, SIX CONCRETE THINGS TO CHECK

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Supersedes the wallet-provisioning check — that hypothesis is now refuted by direct evidence (see below), don't spend more time on it.

## What's now known, with sourcing

A community thread on the earlier GitHub issue (x402-foundation/x402 #2112) has real, dated, verifiable resolutions from multiple independent implementers who got fully indexed. Key facts:

- **Wallet type is not the gate.** One poster's `payTo` has never been a CDP wallet and they have 10 indexed resources; another ran a controlled experiment where both an external EOA and a CDP Server Wallet got stuck identically. Drop the wallet-provisioning investigation.
- **A real settlement genuinely does trigger indexing, fast** — one poster settled 4 previously-unindexed routes and all 4 appeared in `/discovery/merchant?payTo=` within ~1 minute, enriched service page live within ~6 minutes. The `EXTENSION-RESPONSES` header (the original issue's whole focus) was never observed on their side either, working or not — it's a red herring, not diagnostic.
- **The actual cause, confirmed by someone who had Grey's exact symptom (settles fine, never indexed) for weeks:** `api.cdp.coinbase.com/platform/v2/x402/validate` passing clean does **not** guarantee the indexer accepts the body — there's a **separate, stricter validator at `agentic.market/validate`** ("the seller-tools validator") that catches things CDP's own endpoint doesn't. This directly explains Grey's exact paradox — clean CDP validate, still not indexed.

## Task 1 — Run `agentic.market/validate` against the live production URL

This is the one CDP's own endpoint apparently doesn't fully replicate. Do this first, before anything else — it may just tell you exactly what's wrong directly.

## Task 2 — Check these six specific things against Grey's actual CDP challenge body, regardless of what Task 1 says

These are the exact six the resolved case found, several of which are easy to ship without noticing even with a passing `/v2/x402/validate`:

1. `accepts[].asset` — must be the **plain contract address string**, not a richer object.
2. `accepts[].amount` — must be present as an **atomic-units string**. A `price: "$0.01"` shorthand doesn't satisfy this.
3. `resource.url` absolute — **already fixed** (PR #44). Confirm it's still correct, don't assume.
4. `PAYMENT-REQUIRED` header reaching CDP's crawler unmangled — check whether anything sits in front of the VPS's Fastify server (nginx, Cloudflare, any reverse proxy) that could lowercase or strip it via a CORS expose-headers list. This is a new angle nothing so far has checked.
5. **`extensions.bazaar.info.input.type` and `info.output.type` present** — described as required by a discriminated union. Check specifically whether the rebuilt `buildCdpBazaarExtension` (via `declareDiscoveryExtension`) actually includes a `type` field (e.g. `'http'`) inside `input`/`output`, not just `method`/`bodyType`/`body`. Given how many rounds this exact object has needed correcting, this is the single most likely remaining gap — check it directly against what's actually being sent, not against what the code intends to send.
6. `output.example` present (warning-level, not blocking, but check it's actually there).

## Task 3 — Separate, unrelated but worth a quick check while in this territory

The same thread flagged: a handler that catches an exception and still returns `200 + {success:false}` gets treated as success by naive settle-on-2xx middleware, charging the buyer for a failure. Confirm Grey's CDP-route settlement gate only fires on genuine handler success, not on any 2xx regardless of body content — quick check, not an expected finding given how much attention this project has already paid to buyer protection, but worth confirming rather than assuming given a real report of it happening elsewhere.

## Task 4 — Fix whatever Tasks 1/2 find, then re-test with realistic timing

If something's wrong, fix it (same shared-code discipline as before — this likely touches `buildCdpBazaarExtension`/`buildCdpPaymentRequirementsEntry` again). Then one more real Sepolia settlement, same as before. Expect an answer within **~1–6 minutes** this time, not another long poll — if it's still not indexed after that window with a genuinely clean `agentic.market/validate` result, that's a new, real finding worth reporting rather than waiting longer.

## Deliver

Diff export if code changes, full gate green, do not merge. If Task 1/2 find nothing wrong at all, report that plainly too — don't force a fix that isn't there.
