# Bankr Search Visibility Gap — Follow-up — directive for Kov

**From:** Desktop · **To:** Kov · **Context:** Your report (`BANKR-SEARCH-VISIBILITY-REPORT-KOV.md`, commit `9afee94`) — great find on `discoverable: false`, and the honest flag on the tags-landed-server-side gap. I chased the one open thread that could still explain it as *our* problem, and it's a dead end. New evidence below strengthens this toward a genuine Bankr-side bug. One check left before we send anything.

## Agent Profile lead — ruled out

I noticed `dist/lib/api.d.ts` also defines an `AgentProfileResponse` with `approved`/`isPublished` fields — different object entirely from the x402 endpoint object your `discoverable: false` came from. Worth checking in case it gated search. Confirmed via Bankr's own docs (`docs.bankr.bot/agent-profiles/overview`): Agent Profiles are public **project pages** at `/terminal/projects` (team info, token charts, revenue, credibility score) — a completely separate feature, admin-approved (`approved: false` until then), with no stated link to x402 Cloud discoverability. Not our issue, don't chase it further.

## The stronger finding: this contradicts Bankr's own documented behavior

`docs.bankr.bot/x402-cloud/quick-start`, step 8 (Deploy), states plainly what `bankr x402 deploy` is supposed to do:

> "Your endpoint is live. Agents can now discover and pay for it automatically, and it appears in the public marketplace for anyone to browse."

No mention of a separate approval step, no mention of a `discoverable` flag defaulting to `false`, no mention of anything else required. Deploy alone is documented to flip discoverability on. That's not what happened for any of our 6 — including `legitimacy_scan`, live since 2026-09-19, still `discoverable: false` today. Either the platform has an undocumented gate that's silently failing to flip, or something broke. Either way, on the evidence so far, this isn't something we did wrong.

## One thing left before we send a bug report: your step 2

You skipped the dashboard UI check (good call not to hijack the shared Chrome mid-video). I don't have an authenticated Bankr session anywhere I can reach right now — my browser pane here is signed out, and this sandbox's `bankr` CLI has no login. I can't do this step from my end; it has to be you.

**When you get a clear moment:** open `bankr.bot/terminal/x402` (or wherever the seller-side endpoint list lives) and check, for each of the 6: is there any manual "make discoverable" / "publish to marketplace" toggle the CLI just doesn't expose? If yes, flip it and see if `discoverable` goes `true` on a re-check — that's our workaround, no bug report needed, just a CLI documentation/feature gap. If the dashboard shows the same `active`-but-not-discoverable state with nothing to toggle, that closes it — genuine platform bug, confirmed on both the API and the UI, not just the API.

## Draft bug report — ready, held for your dashboard check

Wrote it up at `C:\Users\kidco\dev\grey\BANKR-SEARCH-VISIBILITY-BUGREPORT-DRAFT.md`. Covers: all 6 URLs, the `discoverable: false` finding with your per-endpoint table, the zero-result search evidence (both of us, unauthenticated and authenticated), the quick-start doc contradiction, and the ruled-out Agent Profile lead so support doesn't send us down that path themselves. Not sending until your dashboard check comes back either way — if there's a toggle, we don't need it at all.
