# CDP Discovery Crawler Method — Confirmation — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-05
**Refs:** `CDP-DISCOVERY-CRAWLER-METHOD-CONFIRMATION-KOV-directive.md`

## Outcome, stated plainly up front

Neither Task 1 nor Task 2 confirms a GET-based (or any-method) post-settlement re-probe of `resource.url` — but not because the search came up empty. **Task 1 came up empty because the logging to check doesn't exist.** **Task 2 came up empty because the current CDP docs describe a different mechanism entirely** — one that doesn't involve a separate crawl step at all. That's a bigger finding than a method confirmation, and it's the headline here.

---

## Task 1 — Grey's own logs: no evidence, and a confirmed structural reason why

**There is no request-level logging anywhere in this stack, at either layer.** Not a retention gap, not a missed window — checked directly:

- `/etc/caddy/Caddyfile`'s `api.whitepapergrey.com` block has no `log` directive:
  ```
  api.whitepapergrey.com {
  	reverse_proxy 127.0.0.1:3002
  }
  ```
  `/var/log/caddy/` is empty (`ls -la` → only `.`/`..`). `journalctl -u caddy` in a 20-minute window around a known settlement (2026-08-04 17:40–18:00 UTC, settlement #3) returns **zero** `http.log.access` lines — only TLS/ACME renewal chatter elsewhere in the journal.
- `packages/grey-core/src/server/index.ts:40` — `const app = Fastify({ logger: false });`. Fastify's own request logger is explicitly off. No app-level per-request logging exists anywhere in the offering route or preHandler code either (`grep` across `cdpOfferings.ts`, `preHandler.ts`, `cdpFacilitator.ts` finds exactly one `logger.*` call total, and it's a revenue-ledger-write-failure warning, not a request log).

**Exact journal lines**, `journalctl -u grey-core --since '2026-08-03 22:00:00' --until '2026-08-04 21:00:00'` (spans settlements #2, #3, and #4 in full — 23 hours, 12 total lines, zero of them request-shaped):

```
Aug 03 22:11:29 ip-172-26-5-228 systemd[1]: Stopping grey-core.service - Grey core (HTTP API + x402 payment gate)...
Aug 03 22:11:29 ip-172-26-5-228 systemd[1]: grey-core.service: Deactivated successfully.
Aug 03 22:11:29 ip-172-26-5-228 systemd[1]: Stopped grey-core.service - Grey core (HTTP API + x402 payment gate).
Aug 03 22:11:29 ip-172-26-5-228 systemd[1]: grey-core.service: Consumed 2.360s CPU time.
Aug 03 22:11:29 ip-172-26-5-228 systemd[1]: Started grey-core.service - Grey core (HTTP API + x402 payment gate).
Aug 03 22:11:31 ip-172-26-5-228 node[190833]: {"level":30,"time":1785795091051,"service":"grey-pipeline","component":"grey-core","msg":"grey-core listening on http://127.0.0.1:3002 (x402 gate active, relayer 0xDbDb19E0A316a4d3e2Eb1E25D2D5b3562C9B4Ac8)"}
Aug 04 20:05:56 ip-172-26-5-228 systemd[1]: Stopping grey-core.service - Grey core (HTTP API + x402 payment gate)...
Aug 04 20:05:56 ip-172-26-5-228 systemd[1]: grey-core.service: Deactivated successfully.
Aug 04 20:05:56 ip-172-26-5-228 systemd[1]: Stopped grey-core.service - Grey core (HTTP API + x402 payment gate).
Aug 04 20:05:56 ip-172-26-5-228 systemd[1]: grey-core.service: Consumed 2.948s CPU time.
Aug 04 20:05:56 ip-172-26-5-228 systemd[1]: Started grey-core.service - Grey core (HTTP API + x402 payment gate).
Aug 04 20:05:58 ip-172-26-5-228 node[197829]: {"level":30,"time":1785873958340,"service":"grey-pipeline","component":"grey-core","msg":"grey-core listening on http://127.0.0.1:3002 (x402 gate active, relayer 0xDbDb19E0A316a4d3e2Eb1E25D2D5b3562C9B4Ac8)"}
```

Side note, not this directive's question but worth flagging: `grey-core` restarted at **2026-08-04T20:05:56Z**, ~4 minutes before settlement #4 (2026-08-04T20:10:12Z, tx `0x1824bece...`) — consistent with deploying the `payload.resource` fix immediately before that retest, per the final report's own account.

### Settlement timestamps used to define the search windows (none in the source docs — pulled directly from the chain, since none of the reports record wall-clock time)

| # | Network | Tx | Block timestamp (UTC), fetched via direct RPC |
|---|---|---|---|
| 1 | Sepolia (Task 3 internal-call probe, pre-fixes) | `0x896af7ff...a5d0e` (only a truncated hash exists anywhere in the repo — `CDP-FACILITATOR-PHASE2-TASK3-REPORT-KOV.md:14`) | Unknown — full hash not recoverable from any file, only the date is known (2026-08-03, same report explicitly says the branch "isn't pushed/deployed," so this run never went through the live HTTP route at all) |
| 2 | Sepolia (post-shape-fix validation) | `0xab2eee2ec564f6be41b17b629d26d4e0e96628e482a09f2354eee5b5775d36bb` | **2026-08-03T22:50:06Z** |
| 3 | Base mainnet | `0x20fb0916fd11322e8d26a91a028abaec26126e681e6fe39e2450ae7e83ba35f9` | **2026-08-04T17:48:09Z** |
| 4 | Sepolia (retest, post `payload.resource` fix) | `0x1824bece3cbe8b2f8bc2fe6c9aa25c170708010542d153216100e19d1a6aefc2` | **2026-08-04T20:10:12Z** |

All four settlements' `resource.url` resolves to the same path: `https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan` (confirmed via `CDP-BAZAAR-INDEXING-FINDINGS-for-coinbase.md` and `CDP-FACILITATOR-PHASE2-TASK3-REPORT-KOV.md`; settlement #3's $0.25 / 250,000-atomic-unit amount also matches `legitimacy_scan`'s canonical price in `packages/grey-schemas/src/pricing/table.ts`).

**Confirmed live, right now** (not from a log, from an actual request):
```
GET  /v1/cdp/offerings/legitimacy_scan            -> 404
POST /v1/cdp/offerings/legitimacy_scan (no auth)  -> 402
```
This matches the directive's premise exactly — Grey's POST-only registration is real and live, and a GET does return a plain 404, not the 402 challenge. What's unconfirmed is whether CDP's side ever actually sent that GET.

**Verdict: absence, not confirmation, and the absence is structural.** There is no way to answer "did a GET land and get 404'd" from Grey's own infrastructure, for any of the four settlements, because nothing on Grey's side records inbound requests. This isn't specific to the crawler question — it's a total blind spot for any inbound-traffic question on this service.

## Task 2 — CDP/x402 official docs: read live, and they describe a different mechanism than the one being tested for

Read the **current** seller-facing doc directly (`docs.cdp.coinbase.com/x402/seller/get-discovered` — the old `/x402/bazaar` URL now 307-redirects here; the "Bazaar Indexing Process guide" link inside GitHub issue #2112 pointed at the old URL, so that guide has since been restructured/renamed into this page). Full text pulled via the site's own `.md` endpoint, not a cached summary.

**No HTTP method for a post-settlement re-probe of `resource.url` is stated anywhere on this page — because the page doesn't describe a post-settlement re-probe step at all.** The documented mechanism is:

> "In this guide, you'll configure discovery metadata, validate your endpoint, and complete the paid call that triggers indexing."

> "Every validated endpoint is eligible for indexing in the CDP Bazaar after a successful settled payment."

> "The CDP Facilitator reports the outcome on verify and settle responses in an `EXTENSION-RESPONSES` header. [...] `success` — The metadata was validated and cataloged. `processing` — The metadata was accepted and is being cataloged asynchronously. `rejected` — The metadata was refused."

Indexing, per this doc, is driven by the **verify/settle exchange itself** — the Bazaar metadata rides along on the same request that settles the payment, and CDP either catalogs it synchronously (`success`) or queues it (`processing`). There is no separate "crawler visits `resource.url` independently afterward" step described anywhere on this page, in either direction (GET or otherwise).

The **only** independently-initiated HTTP check this doc describes is the **curation-tier health probe** — and it's explicitly a different, later-stage mechanism, not a gate on basic indexing:

> "**Health** — Passes the platform health probe. Sustained consecutive failures auto-delist the endpoint [...] Curated endpoints are health-probed on a regular interval."

This is scoped to the **curated/featured** tier (§"Get featured: curation tiers"), which sits above basic indexing, not a precondition for it. The doc doesn't state this probe's HTTP method either.

One more directly relevant fact from the same page: the `/validate` endpoint's own example request takes an explicit `"method"` field —
```json
{"resource": "https://api.example.com/report", "method": "GET"}
```
— meaning CDP's own tooling is method-aware, not GET-by-default. Checked Grey's own declaration against this: `adapters/x402-middleware/src/challenge.ts:61` passes `method: 'POST'` into `declareDiscoveryExtension(...)`, correctly, via the CDP-recommended helper (not hand-rolled, per the CDP-PHASE2-use-declareDiscoveryExtension fix). So if CDP's indexing pipeline reads the method off the declared metadata (as the settle-time model above implies), it already knows Grey's routes are POST — a blind-GET crawler wouldn't even be consistent with the documented architecture.

**Net effect on the #3045 hypothesis:** this doesn't refute Grey's four real-settlements-never-indexed finding — that stands, confirmed on-chain, independent of this question. What it does is cast doubt on the *specific mechanism* #3045 hypothesizes (a GET-based re-crawl of `resource.url`) as the reason, at least against what CDP currently documents. If the current architecture really is settle-time cataloging, then either: (a) the `EXTENSION-RESPONSES` header is the real diagnostic and Grey has never captured/checked it on an actual settle call against production (worth a separate, focused check — not chased further here, out of this directive's scope), or (b) docs and reality diverge, which is exactly the kind of gap #2112 already reported for this same header. Either way, "crawler defaults to GET and 404s" is one plausible story among at least two now, not the confirmed mechanism.

## Task 3 — Drafted question for CDP/Coinbase's x402 team (NOT posted, NOT sent — draft only, per the directive)

---

**Draft — for Forces's review before anything goes out:**

> **Subject: Does Bazaar indexing involve any independent post-settlement HTTP re-probe of `resource.url`, and if so, what method?**
>
> We're the team behind `api.whitepapergrey.com` (issue history: #2112, and a follow-up report with four independent, on-chain-confirmed real settlements across two networks, still never indexed — happy to link/re-post if useful context).
>
> Reading the current "Get discovered" guide (`docs.cdp.coinbase.com/x402/seller/get-discovered`), indexing eligibility is described as tied to "a successful settled payment," with the `EXTENSION-RESPONSES` header on verify/settle reporting `success` / `processing` / `rejected`. That reads as a settle-time mechanism, not an independent crawl.
>
> But community discussion around #2112/#2993 repeatedly implies some kind of post-settlement re-visit of the resource's URL — and we have a concrete reason to ask precisely which, if any:
>
> - Our paid routes are **POST-only** (`app.post`, no GET handler at all on that path).
> - A `GET` to the exact live `resource.url` we settle against (`https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`) returns a plain **`404`**, not a `402` challenge — confirmed live, right now, not a guess.
> - We correctly declare `method: "POST"` in our `extensions.bazaar` metadata via `declareDiscoveryExtension()` (not hand-rolled).
>
> If there **is** a post-settlement crawler independent of the verify/settle exchange, and it defaults to (or ever tries) `GET` against `resource.url` rather than the declared method, that would explain our specific symptom directly: it would hit our real production server, get a plain 404, and have nothing to catalog — while everything CDP's own `/validate` endpoint checks (which we do pass, clean, `simulation.outcome: "accepted"`) would look correct, because `/validate` is method-aware and we tell it `POST` explicitly.
>
> Concretely: **does Bazaar indexing involve any HTTP request to `resource.url` independent of the verify/settle exchange itself — and if so, what method does it use, and does it read the method from the declared `extensions.bazaar` metadata or assume one?** If indexing really is purely settle-time (per the current doc), we'd appreciate confirmation of that too, since it would rule out our whole working hypothesis and point us back to `EXTENSION-RESPONSES` (which #2112 also found unreliable/absent) as the actual diagnostic surface.
>
> Four settlement tx hashes on request if useful for cross-referencing against internal indexing logs on your side.

---

## Deliver

- Task 1: no log evidence — confirmed structurally absent (Caddy has no `log` directive on the site block; Fastify built with `logger: false`; no app-level request logging anywhere in the route code), not a retention/window miss. Exact journal lines included above.
- Task 2: no explicit crawler-method statement exists in the current live docs — because the current docs describe settle-time cataloging, not a separate crawl step, with only a distinct curation-tier health probe as the one independently-initiated HTTP mechanism documented (method also unstated). Direct quotes and URLs included above.
- Task 3: question drafted above, not posted anywhere. Awaiting review.
