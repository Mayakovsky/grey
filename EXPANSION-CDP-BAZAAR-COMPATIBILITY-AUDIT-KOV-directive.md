# CDP FACILITATOR / AGENTIC.MARKET COMPATIBILITY AUDIT — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02).
**Nature:** investigation + report ONLY. No production settlement path changes without a Forces ruling on Task 3's finding — this directive stops at "here's what's true," not "here's what I changed."

## Why this exists

Round 2 built a well-tested, internally-consistent Bazaar discovery layer (EvaluationKit, `extra.bazaar` on every 402). But per Coinbase's current docs (`docs.cdp.coinbase.com/x402/bazaar`, checked today, not from training data), **CDP only indexes a resource the first time a payment for it settles through the CDP Facilitator itself** (`https://api.cdp.coinbase.com/platform/v2/x402`) — quote: *"There is no separate registration step: the first successful settlement for a Bazaar-enabled route is when CDP catalogs it."* Grey's `verify()`/`settle()` in `x402-middleware` are hand-rolled — Grey's own relayer, Grey's own on-chain verification, not a call through CDP's API. If that's still true in the actual production deploy, **Grey's real settlements are currently invisible to CDP's indexing, regardless of metadata quality.** This needs confirming against the real running system, not assumed from a possibly-stale local `.env`.

There's also a wire-format question: CDP's v2 extension shape is a top-level `extensions.bazaar` field (populated via their reference SDK's `bazaarResourceServerExtension`/`declareDiscoveryExtension()`), not a `bazaar` object nested inside `accepts[0].extra` the way Grey built it. That may just need a projection/rename, or may be a deeper mismatch — find out before assuming either.

## Task 1 — Confirm the actual production facilitator path

Don't trust the local dev `.env` (it looks like a stale testnet template — `X402_NETWORK=eip155:84532`, zero-address wallet placeholders, `X402_FACILITATOR_URL=https://x402.org/facilitator`). Check what's **actually configured on the production VPS** for Grey's live Base-mainnet deployment: does `verify()`/`settle()` in `adapters/x402-middleware` call out to `https://api.cdp.coinbase.com/platform/v2/x402` anywhere, or is settlement entirely self-hosted (direct viem calls against the relayer wallet, own EIP-3009 verification)? Report which, with the actual code path cited.

## Task 2 — Run CDP's own validator against a live Grey route, read-only

CDP exposes `POST /v2/x402/validate` (also reachable as an MCP tool, `validate_endpoint`, via `https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp`) — probes a URL live, reports whether it's reachable, returns 402, advertises a parseable `extensions.bazaar` block, and would be accepted for indexing. **No payment runs, nothing gets indexed** — it's diagnostic only, safe to run against a real production route (e.g. `https://api.whitepapergrey.com/v1/offerings/legitimacy_scan`). Run it, capture the raw response, report it verbatim — don't summarize away any rejection detail.

## Task 3 — Diagnose the gap, don't close it yet

Combine Tasks 1+2 into a clear finding: is Grey (a) not indexed because settlement never touches CDP at all, (b) not indexed because the extension shape doesn't validate even though settlement does touch CDP, or (c) something else entirely. **Report this and stop.** Whether to route Grey's settlement through CDP's Facilitator — taking on a Coinbase dependency for something that currently runs entirely on Grey's own code — is a real architectural call with cost and platform-risk implications (cf. the project's own build-and-own posture). That's Forces' decision, not something to silently wire in because it would make the metadata "work."

## Task 4 — Separately, note for the record (no action)

I found no self-service application process for Agentic.Market's curated ~70-entry tier in Coinbase's docs — ranking there is described as automatic/objective (buyer reach, transaction volume, recency, metadata completeness), not editorial submission. If Task 3 turns up something that changes that picture, flag it; otherwise this is just a known-unknown to carry forward, not something to chase down further this round.

## Deliver

One report: Task 1's finding (with file/line citation), Task 2's raw validator output, Task 3's diagnosis. No code changes. No settlement rerouting. Stop for Forces' ruling before E2 starts, since E2 (Kite) rides the same x402 rail and inherits whatever's decided here.
