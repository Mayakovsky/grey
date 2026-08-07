# CDP Indexing — Six Checks + Re-test — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-04
**Refs:** `CDP-INDEXING-real-resolution-six-checks-KOV-directive.md`.

## Task 1 — `agentic.market/validate`: one correction to the sourcing, then a clean result

The page itself (`agentic.market/validate`) is a Next.js SPA, not a raw API — no direct POST target. Traced its actual client-side bundle to find the real call: `POST https://agentic.market/api/x402-validate`, `{resource, method}` body, same as CDP's own endpoint.

**Called it directly. Result: byte-identical to CDP's own `/v2/x402/validate`** — same `preflight` array (all 24 checks passing), same `bazaarExtension`, same `paymentRequirements`, `valid: true`, `simulation.outcome: "accepted"`.

This refutes the specific claim that `agentic.market` runs "a separate, stricter validator... that catches things CDP's own endpoint doesn't" — at least for this specific tool. It's a thin pass-through wrapper around CDP's own check, confirmed from its own JS, not assumed. Flagging this precisely because the directive's sourcing turned out to be wrong on this one point, even though other parts of the same research (the six-checks list) turned out accurate and useful.

## Task 2 — six checks against the live challenge body

All checked against the real, live 402 response from `https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan` (captured fresh via the `agentic.market` call above, which echoes the full `paymentRequirements`/`bazaarExtension` it received):

1. **`accepts[0].asset`** — `"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"`, a plain string. ✅
2. **`accepts[0].amount`** — `"250000"`, present as an atomic-units string. ✅
3. **`resource.url`** — `"https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan"`, absolute. Confirmed still correct post-PR #44, not assumed. ✅
4. **`PAYMENT-REQUIRED` header reaching CDP unmangled** — checked the VPS's actual network setup: **Caddy** is the TLS-terminating reverse proxy in front of grey-core (`api.whitepapergrey.com { reverse_proxy 127.0.0.1:3002 }`, nothing else in the Caddyfile — no header rewriting, no CORS config). Nothing there could mangle the header. Also: CDP's own `/validate` already has to successfully read this exact header to report `payment_required_header: passed` — which it does — so it demonstrably arrives intact for at least that caller. ✅
5. **`bazaar.info.input.type` / `info.output.type`** — the directive's strongest suspicion. Checked directly against the live data: `info.input.type: "http"` present, `info.output.type: "json"` present. Both there — this was already correct after `declareDiscoveryExtension` landed (PR #42), not a gap. ✅
6. **`output.example`** — present, a real object (the full `legitimacy_scan` sample response). ✅

**Nothing wrong found in any of the six.**

## Task 3 — settle-on-2xx check

Traced `registerCdpOfferingRoutes` (`packages/grey-core/src/server/routes/cdpOfferings.ts`): the route handler that could return a 2xx runs strictly *after* `cdpGate.preHandler` (`makeCdpX402PreHandler`) has already completed. Fastify's hook lifecycle means if the gate's own logic hasn't already called `reply.send()` with a success path, the route handler never executes at all. The settle decision is made entirely inside `verifyAndSettleViaCdp`'s `outcome.ok`, itself derived directly from CDP's own `/verify`+`/settle` API responses — never from Grey's own downstream HTTP status. There's no "settle because the response came back 2xx" logic anywhere in this path; structurally can't have the described bug. ✅

## Task 4 — no code changes (nothing to fix), re-tested with realistic timing anyway

Since Tasks 1-3 found nothing wrong, there was no fix to make. Re-ran a full real Sepolia settlement anyway, in case timing alone was the issue — same method as before (real local Fastify server running the actual current `main` code, real HTTP round-trip, real CDP faucet, real signed EIP-3009 authorization, real settlement through CDP):

- Settlement: `200`, `PAYMENT-RESPONSE` present, `success: true`.
- On-chain: `status: 0x1`, confirmed via direct RPC, `2026-08-04T01:48:42.231Z`.
- Discovery polled every 30s for **12 attempts / ~6 minutes** (the full window the directive's sourcing said to expect an answer within) — `total: 0` every single time. Search endpoint also empty.

## The honest bottom line

Six specific, concretely-checkable things — all clean. The settle-on-2xx concern — structurally not applicable to this codebase. A validator claimed to be stricter than CDP's own — turned out to be the same check. A real settlement, through the current corrected shape, confirmed on-chain, given the full 1-6 minute window the resolved case reportedly needed — still not indexed.

I don't have a next concrete thing to check that's grounded in evidence rather than another guess. Every angle this investigation and the ones before it have surfaced has now been checked and closed clean. If there's something about live cataloging specifically requiring mainnet (not just `/validate`, which doesn't distinguish networks), a longer batch cycle than 6 minutes, a minimum settlement count, or a completely different CDP-side condition — none of that is visible from what Grey's code or CDP's own public endpoints expose. Stopping here rather than opening a seventh round on a guess with no new evidence behind it.

## Deliver

No code changes. Scratch checkout, bundle, and the `.env` copy used for faucet auth were deleted from the VPS after the run.
