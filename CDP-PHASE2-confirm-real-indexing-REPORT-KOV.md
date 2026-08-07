# CDP Phase 2 — Confirm Real Indexing (Sepolia) — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-confirm-real-indexing-KOV-directive.md`.

## Outcome: **(b)** — real settlement succeeded, still not indexed. Reporting exactly that combination, per the directive.

## Task 1 — real settlement, Sepolia: succeeded

Ran the actual current, merged code (`main` @ `3a0709e`, bundled and staged into a scratch checkout on the VPS — never touched the live production deployment) — this time through a **real local Fastify server** wired with the genuine `makeCdpX402PaymentPresenceCheck`/`makeCdpX402PreHandler` route hooks, exercised via real HTTP round-trips (not internal function calls, unlike the original Task 3 probe):

1. `POST` the route with no payment → real `402`, decoded the real `PAYMENT-REQUIRED` header → got the live challenge (`resource.url: https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`, `accepts[0]` with real Sepolia USDC asset/network/amount/payTo).
2. Funded a fresh buyer via CDP's real faucet (1 USDC, Base Sepolia) — arrived.
3. Signed a real EIP-3009 authorization matching the live challenge's `accepts[0]` exactly.
4. `POST` the same route with the signed `payment-signature` header + a valid body → **`200`**, `PAYMENT-RESPONSE` header present: `{"success":true,"transaction":"0xab2eee2ec564f6be41b17b629d26d4e0e96628e482a09f2354eee5b5775d36bb", ...}`.
5. Confirmed on-chain via direct RPC: **`status: 0x1`** (success), against `0x036cbd53...` — the correct Base Sepolia USDC contract.

Same `payTo` (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`) as the original Task 3 probe — deliberately reused so this result is directly comparable to that earlier (empty) lookup.

## Task 2 — confirm indexing: not indexed

Checked three ways, ~5 minutes after the confirmed on-chain settlement:
- `GET /discovery/merchant?payTo=0x7099...` — polled every 30s for 10 attempts (~5 min): **`total: 0`** every time, never changed.
- `GET /discovery/search?query=legitimacy_scan` — **empty**.
- `GET /discovery/search?query=whitepapergrey` — **empty**.

## The combination of facts, stated plainly

- `POST /v2/x402/validate` against the live production URL: **clean** (`valid: true`, `simulation.outcome: "accepted"`, zero failed checks) — confirmed in the prior round.
- A **real** settlement, through the **current, corrected** challenge shape, via a **real HTTP round-trip** against the actual shipped route code: **succeeded**, confirmed on-chain.
- CDP's own discovery/search endpoints: **still show nothing**, checked three independent ways, ~5 minutes after settlement.

Per the directive: not more waiting, not another shape guess — this is a new, real finding. Something about live cataloging isn't captured by what `/validate` simulates or by a single successful settlement, and I don't have a next hypothesis grounded in evidence the way the last several fixes were. Possible directions I can't distinguish between from here: indexing may run on a slower batch cycle than ~5 minutes; it may require settlement specifically through the **live production** route (mainnet, `eip155:8453`) rather than a Sepolia test, even though `/validate` itself doesn't distinguish networks; it may require a minimum number of settlements; or something else entirely. Stopping here rather than guessing which.

## Deliver

No code changes — verification only, as instructed. Scratch checkout, bundle, and the local `.env` copy used for the faucet auth were all deleted from the VPS after the run.
