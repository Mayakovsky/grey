# Bankr Search Visibility Gap — Investigation Report (Kov)

**Directive:** `BANKR-SEARCH-VISIBILITY-KOV-directive.md` · Raw output per step, verdict left for us to work out together as asked.

## Likely root cause found: `"discoverable": false`

The CLI's pretty-printed `bankr x402 list` output (renders only `active`/version/price/reqs/earned — no hidden fields visible there) doesn't show this. Went past the CLI's rendering and hit the real API directly (`GET https://api.bankr.bot/x402/endpoints`, same auth header the CLI itself uses — `X-API-Key`, confirmed by reading `@bankr/cli`'s own installed source, `dist/lib/api.js:10-16`). Raw JSON response for **every single one of the 6 endpoints** includes:

```json
"discoverable": false,
```

Checked whether this is settable anywhere in the CLI — grepped the entire installed `@bankr/cli` package source (`dist/`) for `discoverable`: **zero matches, anywhere.** Not a deploy-payload field, not a flag on any command, not documented. `bankr.x402.json` has no field for it either (confirmed: the deploy request body is `{ config, bundles }` where `config` is our file verbatim, per `dist/commands/x402.js:378-384` — no `discoverable` key exists in our config, and nothing else sets one). This isn't something we did wrong or omitted — the CLI simply gives no way to turn it on.

## Step 1 — `bankr x402 list`, raw

Human-readable CLI output (all 6 `active`, no visible extra field — matches what you already saw):
```
claim-history active  v1  $0.25 USDC  0 reqs  $0 earned
quick-protocol-facts active  v1  $0.30 USDC  0 reqs  $0 earned
claim-extraction active  v1  $0.75 USDC  0 reqs  $0 earned
verify-whitepaper active  v1  $1.50 USDC  0 reqs  $0 earned
verify-full-tech active  v1  $3.00 USDC  0 reqs  $0 earned
legitimacy-scan active  v1  $0.25 USDC  0 reqs  $0 earned
```
Real raw API response (`GET /x402/endpoints`) is what surfaced `discoverable: false` — full 40KB JSON saved, per-endpoint summary:

| service | status | discoverable | createdAt | lastDeployedAt |
|---|---|---|---|---|
| claim-history | active | **false** | 2026-09-21T00:40:46.243Z | 2026-09-21T00:40:46.240Z |
| quick-protocol-facts | active | **false** | 2026-09-21T00:40:52.143Z | 2026-09-21T00:40:52.141Z |
| claim-extraction | active | **false** | 2026-09-21T00:40:34.657Z | 2026-09-21T00:40:34.655Z |
| verify-whitepaper | active | **false** | 2026-09-21T00:40:22.424Z | 2026-09-21T00:40:22.420Z |
| verify-full-tech | active | **false** | 2026-09-21T00:40:28.949Z | 2026-09-21T00:40:28.943Z |
| legitimacy-scan | active | **false** | 2026-09-19T21:18:36.377Z | 2026-09-19T21:18:36.373Z |

(`legitimacy-scan`'s `createdAt` is from the original deploy two days ago — its `discoverable` has been `false` the whole time, consistent with it never showing up in search either, exactly as you flagged.)

Other fields present per endpoint that aren't in the CLI's rendered output: `bankrFeeBps: 500` (matches the 5% shown in the dashboard), `totalRequests`/`totalRevenueUsd` (both 0, consistent). No `category`/`tags` field appears anywhere in this list response — for **any** service, not just ours (can't fully confirm from this endpoint alone whether tags survived deploy server-side; see step 4).

## Step 2 — dashboard UI

**Not done this pass.** The shared Chrome window was mid-use for something unrelated (a YouTube video open) when I got to this step — didn't want to hijack an active browser session to go digging through the x402 dashboard. Can do this next if useful, or if you're already looking at `bankr.bot/terminal/x402` yourself, tell me what each service's status shows there and I'll fold it in.

## Step 3 — authenticated search, same queries, raw

Ran all 8 queries (6 slugs + `"whitepaper grey"` + `"due-diligence"`) with `bankr x402 search <query> --raw`, authenticated. Same result as your unauthenticated run: **50 results each, 400 total, zero hits** for our payTo address, any of our 6 slugs, or the word "grey" (grepped case-insensitive across all 400 raw result lines). Same index, same outcome — rules out an unauthenticated-vs-authenticated split.

One structural note from inspecting a real (non-ours) result's raw shape: search results **do** carry a `tags` array (e.g. one hit had `"tags": ["security","integrity","leak-detection","injection","execution-protocol"]`) — confirms tags are a real, working, populated field in the marketplace for other developers' listings, same array-of-strings shape we used. No `discoverable` field appears in search *results* themselves, which makes sense structurally — only `discoverable: true` entries would ever be returned there, so the field itself doesn't need to be echoed back.

## Step 4 — deployed config vs source

Confirmed exactly what got sent, straight from `main`'s `integrations/bankr-bridge/bankr.x402.json` (all 6 services):
```
legitimacy-scan       -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
verify-whitepaper     -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
verify-full-tech      -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
claim-extraction      -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
claim-history         -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
quick-protocol-facts  -> category: data | tags: ["crypto","due-diligence","verification","pre-trade"]
```
All 6 include the literal `"due-diligence"` tag you searched for. Price/network/asset/payTo/schema all independently verified live already (`BANKR-BRIDGE-EXPAND-OFFERINGS-STATUS-KOV.md`). The one thing I *can't* fully confirm either way from the API alone: whether `category`/`tags` actually landed server-side, since the seller-side list endpoint doesn't echo them back for any service (ours or otherwise) — no direct way to check via the CLI/API surface I have access to. Given `discoverable: false` is the much stronger, directly-observed candidate (a literal flag blocking search inclusion, not a soft relevance issue), I'd treat that as the primary lead rather than chase the tags question further right now — but flagging it as unresolved rather than assuming it's fine.

## Step 5 — not drafted yet

Given `discoverable: false` looks like a real, concrete, directly-observed cause (not just "config might be wrong" or "needs more time to index"), I held off on drafting the Bankr support report until we've talked through whether this is actually the answer, and whether there's a legitimate reason a service would default to non-discoverable (a manual review/approval gate, an opt-in step in the dashboard that isn't a CLI concept at all, etc.) before calling it a bug. Ready to draft it — or dig into step 2's dashboard check — whichever you want next.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
