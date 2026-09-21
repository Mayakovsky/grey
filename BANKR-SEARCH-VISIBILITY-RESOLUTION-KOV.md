# Bankr Search Visibility Gap — Resolution (Kov)

**Closes:** `BANKR-SEARCH-VISIBILITY-KOV-directive.md`, `-FOLLOWUP-`, `-ROUND3-` · All Option A steps done.

## Dashboard check (step 2, final) — no toggle exists

Checked live, all fields on every service's "Service details" panel (Overview + Edit service form) for `claim-extraction` as a representative check, cross-referenced against the same field set seen earlier for `legitimacy-scan`:

- **Overview panel:** Requests, Revenue (all-time + 7/30-day breakdown), Price, Version, Network, Platform fee, Pay to (`0x394e...3f6` — confirmed matches source config), Token, Last Deploy, Edit/Pause/Remove endpoint buttons.
- **Edit service form:** Description, Price per request, Payment Token, Pay-to address, Save/Cancel.
- Searched the entire page (exact-name and regex, `visibleOnly:false`) for `discover|visib|listed|publish|index|marketplace`: only unrelated nav items (`Discover Bankr tokens` = token-launch feature, `x402 Marketplace` = the same seller dashboard we're already on).

**No manual toggle anywhere in the dashboard UI.** Confirmed on both the API (`discoverable: false`, no client-facing setter) and the UI now — genuinely nothing on our end to flip.

## GitHub comment — posted

[`BankrBot/x402-cli-example#3`](https://github.com/BankrBot/x402-cli-example/issues/3#issuecomment-5766207401) — added our data (6 endpoints, the `discoverable: false` finding, the CLI-source grep result) as a third corroborating account.

## Support channel — submitted via Bankr's in-app AI assistant, response received

No dedicated "Contact support" / ticket system found anywhere in the dashboard sidebar (checked the full nav: Chat, Wallet, Trade, Explore, Projects, x402 Marketplace, Metrics, Build, Tools, API Keys, Skills, x402, Webhooks, Platform, Resources, Docs, Partners — nothing support-shaped). The "Ask Bankr" floating assistant, present on every page, is the closest thing to an in-app support channel. Submitted the bug report through it.

**The assistant actually called a tool** (`list x402 endpoints`) to look up our account live rather than just answering from the prompt, and returned:

> "current platform status for your endpoints: legitimacy-scan: active, discoverable: false, **quality score 50** [same for all 6]... you did not miss a configuration step. neither `deploy_x402_endpoint` nor the update route exposes a client-facing field to toggle discoverable or trigger indexation. marketplace discoverability is controlled by backend indexing and curation criteria that currently leave new endpoints unindexed by default... the engineering team has received the report with your specific service slugs to investigate the indexer pipeline and review manual approval or automated discoverability for these routes."

**New finding, not previously visible:** a `quality score: 50` field, present on all 6, that never appeared in the raw `GET /x402/endpoints` response I inspected directly earlier — this came from whatever internal tool the assistant called, not the public API surface we have access to. Possibly a threshold-gating input to the indexing decision the docs never mention. Can't independently verify or probe this further without their internal API; noting it as a lead, not confirmed mechanism.

**Caveat on "the engineering team has received the report":** this is the AI assistant's own stated claim, not something independently verifiable from our side (no ticket number, no confirmation channel). Treating it as a real signal worth recording, not as confirmed proof a human will act on it — the GitHub issue (3 months, zero maintainer response) is the more durable, public paper trail either way.

## Where this leaves us

- Root cause confirmed on three independent surfaces now: raw API, dashboard UI, and Bankr's own support assistant — all agree `discoverable: false` is set platform-side with no client path to change it, and this isn't a config mistake on our end.
- A public GitHub comment and an in-app support submission are both on record.
- The pre-drafted formal write-up (`BANKR-SEARCH-VISIBILITY-BUGREPORT-DRAFT.md`) is still available if a more formal channel (email, a real ticket system if one surfaces later) becomes useful — holding it rather than duplicating what's already been submitted.
- Option B (self-hosting `/.well-known/x402` etc. on `api.whitepapergrey.com`, independent of Bankr's discovery layer) remains a live, separate strategic question for Forces — not touched here, per the prior directive's framing.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
