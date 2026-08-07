# CDP BAZAAR INDEXING — NEW RESPONSE REVIEW — DESKTOP HANDOFF

**For:** whichever Desktop instance picks this up next.
**From:** prior instance, 2026-08-06.
**Task:** a new response has come in on `x402-foundation/x402#3045` from Nikolife2016 — the same dev who diagnosed the original free-tier/200-response pattern in `#2993` and left the first substantive comment on Grey's thread. Read it, verify anything checkable directly, report findings + a recommendation.

## Where the investigation actually stands — read the real threads, don't work from this summary alone

`#3045` (Grey's own report), `#2993` (free-tier/200 diagnosis), `#2112` (the older, broader Bazaar-indexing thread) — read all three in full first. How the leading theory evolved, in order:

1. **Nikolife2016's original hypothesis:** a route returning 200 to an unpaid request blocks cataloguing. **Checked directly, cleanly refuted for Grey** — curled all 7 real paid routes (`/v1/cdp/offerings/<slug>`), every one correctly 402s on POST with no payment header.
2. **Found independently (not from Nikolife2016):** Grey's paid routes are POST-only; a GET to the exact live `resource.url` returns a plain 404, not a 402. If CDP's crawler defaults to GET — the implicit assumption in every example across both threads — it would find nothing there. Confirmed both live and in source (`packages/grey-core/src/server/routes/cdpOfferings.ts` — `app.post` only, no GET handler registered anywhere).
3. **Current leading theory, which demotes #2 to secondary:** CDP's own current docs (two independent pages — `docs.cdp.coinbase.com/x402/seller/get-discovered` and `/x402/bazaar` — corroborating each other) describe cataloguing as happening at **settle time**, not via any independent crawl — tied to the `EXTENSION-RESPONSES` header on the verify/settle exchange reporting `success`/`processing`/`rejected`. If that's accurate, there's no crawl step for the POST-only theory to break, and this points straight back to `EXTENSION-RESPONSES` — which `#2112` spent months documenting as unreliable or entirely absent across multiple independent sellers, confirmed at the raw HTTP level before any middleware could strip it.

**A question grounded in all of this was posted directly on `#3045`** — asked whether indexing involves any HTTP request to `resource.url` independent of verify/settle, and if so what method, or whether it's purely settle-time per the current docs. It's live; check the thread for any other activity beyond Nikolife2016's new response before assuming that's the only thing that's happened.

**Separately dispatched, status unconfirmed — check before assuming done:** `PRODUCTION-REQUEST-LOGGING-KOV-directive.md`. Grey had zero request-level logging anywhere (Caddy: no `log` directive; Fastify: `logger: false`) — closing that gap so a future investigation isn't starting blind the way this one did. No completion report was received before the session moved to other work.

## What to actually do

1. Read the new response on `#3045` directly (browser, or the `github` MCP connector if it's set up in this instance).
2. Verify any checkable claim in it against Grey's real code, live endpoints, or CDP's actual current docs — same discipline as everything above, don't take it at face value regardless of this dev's track record so far.
3. Confirm whether the logging directive actually completed. If not, that's worth a nudge before relying on anything requiring log evidence.
4. Report findings and a recommendation. If this resolves the question, write a closing summary (same convention as `EXPANSION-E2-SUMMARY.md`) so this stops being an open loose end.
