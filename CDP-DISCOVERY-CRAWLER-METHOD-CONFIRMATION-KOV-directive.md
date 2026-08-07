# CDP DISCOVERY CRAWLER METHOD — CONFIRMATION — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-05).
**Goal:** confirm what HTTP method (if any) CDP's Bazaar discovery crawler uses to re-probe a resource's `resource.url`, to test the hypothesis from the `x402-foundation/x402#3045` investigation: Grey's paid routes are POST-only (`app.post` in `packages/grey-core/src/server/routes/cdpOfferings.ts`), and a GET to the exact `resource.url` returns a plain 404 rather than the 402 challenge — confirmed live and in source. If CDP's crawler defaults to GET, as every cited example across `#2112`/`#2993` implies, it would find nothing to catalogue.

## Task 1 — Check Grey's own logs first (highest-value, entirely within reach, do this before anything external)

The four known real settlements from `#3045` have known timestamps and tx hashes. For each:

- Search VPS access logs — Caddy's (confirmed present on every live response: `via: 1.1 Caddy`) and Fastify's own request logs if enabled — for any request to that settlement's exact `resource.url` path in the minutes-to-hours following the on-chain confirmation. Per Nikolife2016's own timing data in `#2993`, ingest runs in 60–90 minute batches, not continuously — that's the window to search.
- Look specifically for: any **GET** (or any non-POST method) hitting `/v1/cdp/offerings/<slug>`, any request with a User-Agent that isn't a browser and isn't the known test-buyer client, and — critically — **what status code Grey's own server actually returned** to that request.
- A GET landing near a settlement time and getting 404 is direct confirmation. Finding nothing at all is also informative — it would mean either the crawler doesn't re-probe over HTTP the way assumed, log retention doesn't reach back far enough, or the crawl fell outside whatever window was searched. Report which.
- **Report exact log lines**, not a summary — this is evidence, treat it like the diff-review discipline: real bytes, not a paraphrase.

## Task 2 — Check CDP/x402 official docs for a stated crawler behavior

Read the current Bazaar Indexing Process guide and any CDP discovery API docs directly for an explicit statement of what method/protocol the crawler uses to validate or re-probe a listed resource. Don't assume from memory or a prior summary — read the live doc text. Cite directly if found; report plainly if not.

## Task 3 — Draft, don't send, a direct question to CDP

If Tasks 1–2 don't produce a clean answer, draft the exact question to put to CDP/Coinbase's x402 team — reply on `#3045`, a CDP support channel, wherever's appropriate — asking specifically what HTTP method the Bazaar discovery crawler uses to re-probe `resource.url` post-settlement. Cite Grey's own POST-only registration and the live 404-on-GET finding as concrete grounding. **Do not post or submit this anywhere** — posting public content is Forces's call, not yours; this is a draft for review only.

## Deliver

Report: Task 1's log findings (exact lines, or confirmed absence and why), Task 2's doc findings (citation or confirmed absence), and Task 3's drafted question, ready for Forces to review before anything goes out publicly.
