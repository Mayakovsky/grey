# CDP Bazaar — Real Confirmation: Grey Is Indexed (Directive 136)

**From:** Kov · **To:** Desktop / Forces · 2026-08-24
**Refs:** `BION-DIRECTIVE-136-indexing-recheck-now.md`, `CDP-BAZAAR-REAL-SETTLEMENT-6-INDEXING-TEST-KOV-REPORT.md`

## Outcome, stated plainly up front

**Indexed.** The real merchant/`payTo` lookup — the same authoritative check this entire investigation has used as ground truth every round — now returns Grey's `legitimacy_scan` offering, full record, real timestamp matching the settlement exactly. This is the answer three-plus weeks of investigation was chasing.

## Real, fresh check just now

```
GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x394e81DA28799b578620803772FAeE403dE2d3f6

{"pagination":{"limit":20,"offset":0,"total":1},
 "payTo":"0x394e81DA28799b578620803772FAeE403dE2d3f6",
 "resources":[{
   "resource":"https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan",
   "serviceName":"Project Legitimacy Scan",
   "description":"Fast structural + claims legitimacy read on a token project, cache-or-live.",
   "tags":["crypto","due-diligence","verification","tier1"],
   "lastUpdated":"2026-08-24T02:44:53.737Z",
   "quality":{"lastCalledAt":"2026-08-24T02:44:53.737Z"},
   ...full accepts[]/extensions.bazaar echoed back...
 }]}
```

**`total: 1`, not `0`.** `lastUpdated`/`lastCalledAt` (`2026-08-24T02:44:53.737Z`) matches the real settlement's own `EXTENSION-RESPONSES` log timestamps exactly (`02:44:52`/`02:44:53` in `CDP-BAZAAR-REAL-SETTLEMENT-6-INDEXING-TEST-KOV-REPORT.md`) — this is that same settlement's real result, not a stale or unrelated record. The echoed `extensions.bazaar.schema` in this indexed record carries **no `$id`** — direct, live confirmation the fixed (stripped) declaration is what's actually indexed, not the old broken one.

## Secondary checks — not yet showing there, not a contradiction

`GET /discovery/resources?limit=50` and `GET /discovery/search?query=legitimacy` still show no match for `whitepapergrey`/`legitimacy_scan`. Read honestly: these are broad, unscoped catalog/search endpoints (this investigation's own earlier check against `/resources` returned unrelated third-party entries, suggesting a large total catalog) — a 50-row page or a specific search-term match not yet surfacing Grey's one new entry isn't evidence against indexing; the `payTo`-scoped merchant lookup is the authoritative, targeted check this whole thread has relied on throughout, and it's unambiguous.

## `e1-e` — real update

**Indexing is confirmed, for real, independently checkable by anyone querying this same public endpoint.** Curated-tier placement (the actual `e1-e` ask, "sorts above the general index") is a separate question this check doesn't answer — no field in the merchant response indicates curated status one way or the other. That's the next real thing to check, not decided or assumed here.

## Non-scope

Read-only, no spend, per the directive's own scope.
