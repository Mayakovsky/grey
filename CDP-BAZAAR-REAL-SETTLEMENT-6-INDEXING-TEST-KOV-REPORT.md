# CDP Bazaar — Real Settlement #6 Against the Fixed Code: New Signal, Not Yet Fully Indexed (Directive 135)

**From:** Kov · **To:** Desktop / Forces · 2026-08-24
**Refs:** `BION-DIRECTIVE-135-verify-funding-and-run-settlement.md`, `CDP-BAZAAR-WALLET-BALANCE-CHECK-KOV-REPORT.md`

## Outcome, stated plainly up front

**Real, genuinely new signal — the strongest yet — but discovery indexing hasn't completed within a reasonable real window.** `EXTENSION-RESPONSES` now shows `{"bazaar":{"status":"processing"}}` — a status never once seen in this entire investigation (every prior attempt got either `{}` or an explicit `rejected`). That's real, direct evidence CDP is evaluating the fixed declaration differently. But `/discovery/merchant`, `/discovery/resources`, and `/discovery/search` all still show no result for Grey after ~16 minutes of real polling (10 pre-settlement + 6 post-settlement). Reporting exactly this, not rounding up to "resolved."

## Step 1 — funding verified independently, on-chain, before proceeding

Two independent RPCs, same block, both agreeing: `0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE` held exactly **`0x3d090` = 250000 atomic = $0.25 USDC** — precisely the amount needed. Did not proceed on Forces' say-so alone, per the directive's own instruction.

## Step 2 — real settlement, reused the proven mechanism, not hand-rolled

Rebuilt the real settlement script (deleted after use, same as every prior round — `scratch-real-settle-round2.mts`, confirmed gone, never tracked). Same real technique as `CDP-BAZAAR-STEP2-V2-REAL-SETTLEMENT-COMPLETE-REPORT-KOV.md`: decrypted the kept keystore (`.cdp-step2-v2/`, real `@grey/ceremony` decrypt, address re-derivation confirmed matching before use), real unmodified `x402Client` from `@x402/core/client`, one real EIP-3009 `exact`-scheme client registered, signed with the real funded key against Grey's real live 402.

**Real result:**
```
settle status: 200
PAYMENT-RESPONSE present: true
{"success":true,"transaction":"0xc6e4fd0a750ace3214ad0fc5284a151494275fde09f148ec82b3511d7c771aac","network":"eip155:8453"}
paymentPayload.extensions echo matched the server's declaration exactly (byte-for-byte)
```

## Step 3 — on-chain confirmation, two independent RPCs, both agree

```
mainnet.base.org  : status 0x1, Transfer 0xa945f4b5...217EE -> 0x394e81DA...2d3f6, 250000 (=$0.25)
1rpc.io/base      : status 0x1, identical logs — independently confirmed
```
Real tx sender (gas payer) was a different address (`0x64cc42b1...`) — confirms this is a gasless EIP-3009 meta-transaction; CDP's facilitator relayed and paid gas, matching the pattern established in prior rounds (the buyer wallet's ETH dust was untouched, confirmed unchanged before/after).

## Step 4 — `EXTENSION-RESPONSES`: the real, new signal

```
journalctl -u grey-core (real-time, this settlement):
[x402] extension responses: {"bazaar":{"status":"processing"}}
[x402] extension responses: {"bazaar":{"status":"processing"}}
```

**This status has never appeared once in this entire three-week-plus investigation.** Every prior settlement produced either silence, `{}`, or an explicit `"status":"rejected"`. `"processing"` is real, direct evidence the fix changed CDP's real evaluation of the declaration — it's no longer being rejected outright. Checked again ~10 minutes later: no newer log line, still the same last-known status — CDP hasn't pushed a follow-up update through this channel (if one exists at all; not documented anywhere in this investigation's prior findings).

## Step 5 — discovery poll: real, honest, not yet indexed

Polled all three real endpoints this investigation has used:
- `GET /discovery/merchant?payTo=0x394e81DA...` — 30s intervals, 6 real minutes post-settlement (on top of the 10 real minutes already polled pre-settlement in D-133): **`total: 0` throughout, never changed.**
- `GET /discovery/resources` and `GET /discovery/search?query=legitimacy` — checked once each: **no match for `whitepapergrey`/`legitimacy_scan` anywhere in either response.**

**The honest read:** `"processing"` is real forward motion, not a false signal — but it is exactly what its name says, an in-flight state, not a completion state. Whatever asynchronous step CDP runs between accepting a declaration and it actually appearing in discovery has not finished within ~16 real minutes of polling across two windows. This is a longer window than the ~1–6 minutes a different poster's case (cited early in this thread) reportedly took — that data point was never confirmed to be Grey's own experience, and this real result suggests it may not generalize.

## `e1-e` — real, precise answer

**Not resolved yet. Real progress, not full resolution.** The actual three-week blocker (the schema-level rejection) is conclusively fixed and now produces a genuinely different, more favorable server-side response (`"processing"` vs. `"rejected"`). Discovery indexing — the prerequisite Task 4 asked about — has not completed within a real, reasonable poll window. Curated-tier placement (the actual `e1-e` ask) sits a level above basic indexing per the MEP's own framing ("sorts above the general index") and can't be assessed at all until indexing itself completes. **Indexed and curated are confirmed to be two separate, sequential steps, not the same thing** — but neither is confirmed complete yet.

## What's real and actionable from here, not decided here

Two honest possibilities, not distinguishable from what's checkable today: (1) indexing genuinely takes longer than this investigation's working assumption and would appear with more real wait time, or (2) `"processing"` itself eventually resolves to something other than success and indexing won't follow this settlement either. A longer poll window (checked once, later — not another live-blocking wait) or a direct question to CDP/Agentic Market support (this thread has reached out to them before) are the two real next options; not choosing between them here.

## Non-scope / cleanup

Scratch script deleted, confirmed gone, never tracked. No wallet key material printed anywhere in this report or its logs — only the public address and real, non-secret transaction data. No further spend beyond the one authorized settlement.
