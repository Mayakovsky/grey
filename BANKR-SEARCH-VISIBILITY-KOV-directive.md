# Bankr Search Visibility Gap — Investigate — directive for Kov

**From:** Desktop · **To:** Kov · **Context:** All 6 Bankr Bridge offerings are confirmed live (`BANKR-BRIDGE-EXPAND-OFFERINGS-STATUS-KOV.md` — 6/6 return correct `402`s on unauthenticated `curl`, verified again independently today). But none of them show up in Bankr's public marketplace search, and this isn't a fresh-deploy indexing-lag thing — `legitimacy_scan` has been live since the original build and is just as absent as the 5 new ones.

## What I found (today, unauthenticated, no account needed)

Ran `bankr x402 search <query>` via `@bankr/cli` for: each of the 6 slugs individually, `"whitepaper grey"`, and `due-diligence` (a literal tag on all 6 of our `bankr.x402.json` entries). Every query returned up to 50 ranked results. Across ~400 result lines total: **zero** hits for our payTo address (`0xcf888f6a54d59c7c85855f4479aa1379ca2887a3`), any of our 6 slugs, or the word "grey."

I don't have an authenticated Bankr session in my sandbox (`bankr x402 list` fails with `Not authenticated` here), so I can confirm the *symptom* (unreachable via public search) but not the *cause* from the account side. That's your side of this — you have the working login.

## What I need you to check

1. **`bankr x402 list`, authenticated, full raw output for all 6.** Paste it verbatim, not a summary. Look specifically for any field beyond `active` — a visibility/indexed/published/review-status flag we haven't seen in the docs but might exist in the real response.
2. **The dashboard UI directly** (`bankr.bot/terminal/x402` or wherever the seller-side view lives) — for each of the 6, is there a "listed in search" / "pending" / "draft" indicator? Screenshot or describe exactly what each service's status shows.
3. **Re-run `bankr x402 search` yourself**, authenticated, for the same queries I used (own slugs, `due-diligence`, `whitepaper grey`) — just to rule out the possibility that unauthenticated search and authenticated search hit different indexes.
4. **Sanity-check the deployed config matches source** — whatever the CLI/dashboard exposes for a live service's `description`/`category`/`tags`, confirm it matches what's actually in `integrations/bankr-bridge/bankr.x402.json` on `main`. If something got mangled or dropped on deploy (e.g., `category`/`tags` not surviving `bankr x402 deploy`), that would explain a search-relevance miss even with `enabled`/`active` status correct.
5. **If steps 1–4 all look correct on our end** (config is right, status says active/published, nothing flags a pending review) — that's grounds to treat this as a Bankr-side platform bug. In that case, draft (don't send yet) a support report: the 6 live URLs, our search queries + zero-result output, and what the dashboard/list showed. Bring it back for review before it goes to Bankr.

## What this isn't

Not urgent-fix-at-all-costs — nothing is broken in the sense of returning wrong data or leaking anything; the routes work correctly for anyone who already has the URL. This is purely a discoverability gap: paying agents who'd find us by searching can't find us right now.

Report back with what you find — raw output, not just a verdict — and we'll figure out the fix/workaround/bug-report together from there.
