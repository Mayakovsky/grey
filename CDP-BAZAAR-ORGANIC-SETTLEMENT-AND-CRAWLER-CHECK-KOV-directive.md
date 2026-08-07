# CDP BAZAAR — ORGANIC PRODUCTION SETTLEMENT + CRAWLER CHECK — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov (fresh instance — the prior one crashed before starting
this) · **Status:** AUTHORIZED by Forces.
**Real money. One settlement. Stop and report after — do not repeat without a fresh explicit go,
regardless of outcome.**

---

## HANDOFF — READ THIS FIRST, you have no prior context

### Operating rules (standing)
- Three-role rhythm: Forces decides, Desktop (Claude) authors specs/reviews, you implement.
- Communications back to Desktop/Forces are markdown files written to disk — never chat-only.
- Explicit `git` paths only. Never `git add -A`. Merges/pushes/deploys are Forces-gated.
- No time estimates. No deferral — if something's blocked, say what's blocking it and stop.
- MCP failure discipline: 3 retries, then stop and report.
- **Real-money discipline, specific to this directive:** one settlement, then stop. Don't repeat,
  don't improvise a second attempt on a hunch, even if the first one looks wrong — report and wait.

### What Grey is, and what this task is about
Whitepaper Grey (`api.whitepapergrey.com`) is a live DeFi due-diligence agent earning real USDC on
Base mainnet, served by `grey-core` (`packages/grey-core`), deployed and stable behind Caddy on a
production VPS (`44.243.254.19`, user `ubuntu`, systemd unit `grey-core`, `127.0.0.1:3002`). Full
background on the investigation this belongs to (why Grey's resource never appears in CDP's Bazaar
catalogue despite clean settlements): `CDP-BAZAAR-INDEXING-FINAL-REPORT-for-github.md` and
`CDP-BAZAAR-SETTLEMENT-AUDIT-AND-RLS-DRAFT-REPORT-KOV.md` (a prior Kov instance's methodology
audit) — not required reading to execute this, but there if anything below needs more grounding.

**Confirmed clean start:** Desktop checked the repo (`.cdp-mainnet-test/`, `.sepolia/`, repo root,
`scripts/`) and Bion's mailbox for any trace of a prior attempt at this directive. Nothing — no
wallet generated, no report, no partial state. The Kov instance that crashed never reached Step 0
below. Treat this as a genuine first attempt, not a resume.

### Why this settlement is simpler than the four before it
Settlements #1–4 each spun up a scratch local Fastify server to test code before it was deployed.
`grey-core` is now deployed and stable — **you don't stand up any server for this.** You just act
as a genuine buyer against the real, live, public endpoint, the same HTTP round-trip any actual
customer would make. That's what makes it "organic": indistinguishable from real traffic, because
it is real traffic, just deliberately triggered. Cleanup afterward is minimal — just your signing
script and its key material, no server checkout involved.

### Repo / production layout
- Local checkout: `C:\Users\kidco\dev\grey`. The 7 paid CDP offering routes:
  `packages/grey-core/src/server/routes/cdpOfferings.ts`.
- Production Caddy access log (needed for Step 2): `/var/log/caddy/api.whitepapergrey.com.log`,
  on the VPS. Confirmed live and logging as of the last logging-verification round.
- `grey_two.revenue_events` — the DB table this settlement should (and previously didn't) write a
  row to; see the audit report above for why prior settlements didn't.

---

## THE ACTUAL TASK

### Step 0 — fresh wallet, report address, wait for funding

Don't reuse any existing Grey wallet (agent, relayer, cold pool, ACP seller) or Benthic's, or the
old `.cdp-mainnet-test/mainnet-test.keystore.json` wallet from settlement #3. Generate a brand-new
one, same local encrypted-keystore pattern used elsewhere in this repo. Report the address back —
not sensitive, fine to include directly. **Stop here and wait.** Forces will fund it directly with
a small amount of real USDC and a small amount of ETH for gas on Base mainnet. Confirm the funding
landed on-chain yourself before proceeding — don't proceed on a funding message alone.

### Step 1 — one real settlement against the live production endpoint

Once funded:

1. Target the **cheapest** currently-priced offering to minimize real money at risk (check current
   pricing — `claim_evaluation` was $0.05 as of the last pricing pass, confirm it's still cheapest
   before picking).
2. From wherever's convenient (doesn't touch any server-side code either way), make a real HTTP
   request to `https://api.whitepapergrey.com/v1/cdp/offerings/<slug>`, get the real 402 challenge,
   sign a real EIP-3009 authorization with the funded wallet, resubmit with the payment header,
   confirm a real `200` + `PAYMENT-RESPONSE: success`.
3. Confirm on-chain the same rigorous way as always: real tx hash, direct RPC confirmation,
   `status: 0x1`, correct Base mainnet USDC contract address.
4. **Confirm the ledger write actually happens:** query `grey_two.revenue_events` for a new row
   matching this settlement. This is the first settlement that should actually produce one, since
   it goes through the real deployed service. If it doesn't, that's a real finding — report it
   plainly, don't paper over it.

### Step 2 — the crawler check

Immediately after on-chain confirmation:

1. Note the exact settlement timestamp.
2. Grep `/var/log/caddy/api.whitepapergrey.com.log` for any request to any of the 7 paid CDP
   offering routes in roughly the hour before and after that timestamp, from any source IP, any
   method, that does **not** carry a payment header.
3. Report every match verbatim: method, path, source IP if available, timestamp offset from
   settlement, whether a payment header was present.

### Step 3 — standard discovery poll

`GET /discovery/merchant?payTo=` (or search) for a reasonable window — 10 minutes is enough per
prior evidence. This is still the primary open question from the GitHub thread; report indexed or
not, same as always.

## Cleanup

Delete the signing script and any `.env`/key material used for this wallet from wherever you ran
it, once the report's written. No server checkout to clean up this time.

## Deliver

One report covering all three steps: settlement confirmation (tx hash, on-chain status,
`revenue_events` row or its absence), the crawler-check grep output verbatim, and the discovery
poll result. Concrete evidence throughout, not summarized conclusions.
