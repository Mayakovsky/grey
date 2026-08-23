# CDP Bazaar — Reference Buyer Client Test — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `CDP-BAZAAR-REFERENCE-BUYER-CLIENT-TEST-KOV-directive.md`

## Outcome, stated plainly up front

**Confirmed: the real, unmodified `@x402/core` `x402Client` performs the extensions echo,
unprompted, purely from consuming Grey's real, live production 402.** Verbatim capture below —
`paymentPayload.extensions` produced by the reference client is byte-for-byte identical to
`paymentRequired.extensions` on the real 402 it consumed. **Step 1 done. Stopping here per the
directive's explicit instruction — no settlement attempted, no Step 2.**

This makes the leading explanation for every one of Grey's five real settlements' empty
`EXTENSION-RESPONSES` exactly the one your directive's context section proposed: **all five used
hand-rolled signing scripts, never the real `x402Client`** — so if none of those hand-rolled
scripts independently performed this echo (and nothing in Grey's prior work suggests they did),
`extensions.bazaar` was likely never actually transmitted for any of them. Not a CDP-side drop,
not a Grey server-side bug — a buyer-tooling gap in Grey's own historical test/settlement scripts.

## Method

Built `adapters/x402-middleware/scratch-refclient-echo-test.mjs` (deleted after — see below),
run on the VPS against `http://127.0.0.1:3002` (port 3002 stays firewalled off-box; same server,
local access, no external exposure needed):

1. Real `POST /v1/cdp/offerings/legitimacy_scan`, no payment header, real request body — the exact
   same offering as settlement #5, for direct comparability with the prior two reports.
2. Decoded the real `PAYMENT-REQUIRED` response header via `@x402/core/http`'s own
   `decodePaymentRequiredHeader` — this is Grey's actual, live, current 402, not a mock.
3. Constructed a real `x402Client` instance (imported directly from `@x402/core/client`, completely
   unmodified) and registered one stub scheme client for `eip155:8453`/`exact`. **The stub only
   supplies EIP-3009 signing mechanics** (Grey has no buyer-side EVM scheme package installed —
   it's a seller, never a buyer) — the same disposable Anvil test key as the last two rounds, no
   real funds. **The thing actually under test — whether `createPaymentPayload()` merges
   `paymentRequired.extensions` into the final payload — is entirely `x402Client`'s own real,
   unmodified `mergeExtensions()` logic** (confirmed by reading it directly:
   `if (!clientExtensions) return serverExtensions;` — the merge happens regardless of what the
   stub scheme client contributes, since it contributes no extensions of its own).
4. Called `client.createPaymentPayload(paymentRequired)` — no signing/broadcast to CDP, payload
   construction only, exactly the directive's stated scope for Step 1.

## Verbatim capture

**What our real 402 declared** (`paymentRequired.extensions`, from the live decoded header):
```json
{"bazaar":{"info":{"input":{"type":"http","method":"POST","bodyType":"json","body":{"token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","project_name":"Example Protocol"}},"output":{"type":"json","example":{"...":"..."}}},"schema":{"...":"full legitimacy_scan request schema"}}}
```

**What the real reference client built** (`paymentPayload.extensions`, from
`client.createPaymentPayload(paymentRequired)`, no hints or config beyond registering the stub
signer):
```json
{"bazaar":{"info":{"input":{"type":"http","method":"POST","bodyType":"json","body":{"token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","project_name":"Example Protocol"}},"output":{"type":"json","example":{"...":"..."}}},"schema":{"...":"full legitimacy_scan request schema"}}}
```

Full `JSON.stringify` comparison in the actual run: **identical, byte-for-byte** (script printed
`echo present: true` from a direct string-equality check on the two serialized objects). Also
worth noting from this run, unprompted: the real 402's `accepts[0].payTo` reads
`0x394e81DA28799b578620803772FAeE403dE2d3f6` — the real, current production `payTo`, confirming
this hit Grey's actual live route, not a stale or cached response.

Cleaned up: `scratch-refclient-echo-test.mjs` deleted from both the VPS
(`/opt/grey/grey/adapters/x402-middleware/`) and local checkout immediately after, confirmed gone
both places, `git status` shows it was never tracked either.

## What this settles, and what it doesn't

**Settles:** the mechanism itself works exactly as the SDK's source promised — a spec-compliant
buyer client, with zero special handling, automatically echoes a seller's 402-declared extensions
into what it submits. Grey's server-side code (confirmed last round) faithfully passes that through
untouched to CDP. **Both ends of the real pipeline work correctly when a real reference client is
the buyer.**

**Doesn't settle:** what Grey's own five real settlements' hand-rolled scripts actually sent —
there's still no request-level logging in production to check retroactively (same gap noted last
round). This test proves the mechanism *can* work, not that it *did* for any past settlement.
That's exactly what Step 2 (a real settlement using the actual reference client) would establish —
holding there per the directive's explicit instruction.

## Deliver checklist

- [x] Step 1: real reference client, real production 402, verbatim captured payload — echo
      confirmed present, byte-for-byte match stated plainly
- [x] No signing/broadcast to CDP attempted — payload construction only, no new money
- [x] Scratch script cleaned up both sides, confirmed gone
- [x] Stopped after Step 1 as instructed — **waiting for an explicit go before Step 2**
