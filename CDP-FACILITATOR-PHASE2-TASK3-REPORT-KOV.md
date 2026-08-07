# CDP Facilitator Phase 2 — Task 3 — Real Testnet Settlement — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md` (Task 3), resumed per `CDP-401-ROOT-CAUSE-force-ipv4-KOV-directive.md`.

## Setup

Since the branch isn't pushed/deployed (per the hold), I couldn't exercise Task 3 through a live HTTP route. Instead I ran a throwaway script that calls the actual shipped code path directly (`makeCdpFacilitatorClient` + `verifyAndSettleViaCdp` from `cdpFacilitator.ts`, unmodified) — real CDP calls, real Base Sepolia chain, not a reimplementation. It had to execute from the VPS's IP (the now-fixed allowlisted address), so I staged the branch into a scratch checkout there via a local `git bundle` (never pushed to GitHub, never touched the live `/opt/grey/grey` deployment) — installed just `@grey/x402-middleware`'s deps, ran the script, then deleted the entire scratch checkout, the bundle, and the `.env` copy afterward. Nothing from this run is committed or left on the VPS.

## Result: the settlement itself — real, verified, succeeds

1. Generated a fresh buyer keypair, requested 1 USDC from **CDP's own faucet** (`POST /v2/evm/faucet`, Base Sepolia) — arrived: buyer balance 0 → 1,000,000 atomic.
2. Signed a real EIP-3009 `transferWithAuthorization` for `legitimacy_scan`'s price ($0.25 / 250,000 atomic), exactly the wire format a real buyer would send Grey.
3. Called `verifyAndSettleViaCdp` for real, against CDP's live facilitator (`resource: https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`, the route's real intended production URL) → **`{ ok: true, txHash: 0x896af7ff...a5d0e }`**.
4. Confirmed on-chain via a direct RPC call to `sepolia.base.org`: **`status: 0x1` (success)**, against `0x036cbd53...` — Grey's own configured Base Sepolia USDC contract address, byte-for-byte. (This also closes out the `prices.ts` comment flagging that address as "must be re-verified against the live contract before the Phase D testnet round-trip" — now verified.)

This proves the code, the CDP integration, and the wire-shape translation (v1 buyer payload → CDP's live v2 protocol) all work end-to-end against real infrastructure, not mocks.

## Result: discovery-endpoint confirmation — not yet showing, likely why

Per the directive, this is "the real proof, not just 'the call didn't error'" — so I want to be precise that it hasn't landed yet, not paper over it.

Checked three ways: `GET /discovery/resources` (paged through 1000/14,700, no match), `GET /discovery/search?query=...` (no match), and the targeted one — `GET /discovery/merchant?payTo=<the address used>` (built for exactly this: "all active x402 resources associated with the specified payTo"). Polled the merchant lookup every 30s for 5 minutes after the settlement confirmed on-chain: `total: 0` on every attempt, never changed.

**My best-evidence guess, not confirmed:** the `resource` URL I used (`https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`) doesn't currently resolve to anything — that route only exists on this unmerged, undeployed branch. If CDP's indexer validates/crawls the resource URL to build a full Bazaar catalog entry (metadata, schema, etc.) rather than indexing off the settlement call alone, a settlement against a URL that 404s might never get indexed regardless of how long I wait. I did not test this by deploying the branch to production to make the URL live — that's a bigger, more consequential action than anything authorized so far (unreviewed code, no PR, straight to prod), so I stopped rather than deciding that myself.

I don't have a way to distinguish "indexing just takes longer than 5 minutes" from "indexing needs the URL to be live" from here without either waiting much longer or making the URL real. Flagging as a genuine open question rather than guessing further.

## Where this leaves Phase 2

- Task 3's core requirement — a real settlement completing through CDP — is done and independently verified on-chain.
- The discovery-endpoint proof is incomplete, for a reason I can characterize but not confirm.
- Branch still not pushed, no PR — holding, as instructed, pending your call on how to close out the discovery-endpoint question (wait longer on the merchant lookup? treat the on-chain settlement as sufficient proof and move on? something else?).
