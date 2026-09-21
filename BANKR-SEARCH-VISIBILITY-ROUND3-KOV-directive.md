# Bankr Search Visibility Gap — Round 3: it's confirmed, not us — directive for Kov

**From:** Desktop · **To:** Kov · **Context:** Forces wanted another pass before we accept the docs at face value — good call, because there was more here. This closes the "are we missing a step" question for good.

## Checked and ruled out: no skill.md / onboarding step we're missing

Forces' instinct was that Bankr might expect some kind of `skill.md`/agent-onboarding step we skipped. Chased it directly:

- `docs.bankr.bot/skills/for-other-agents/installation` — that's for agents *consuming* Bankr as a tool, unrelated to x402 Cloud sellers.
- The `agentres.dev`/`nirholas/x402-skill-md` "SKILL-MD" pattern is real, but it's a third-party, self-hosted convention for the broader x402 ecosystem (a seller publishes their own `skill.md` at their own domain) — it makes no mention of Bankr, and isn't something Bankr's platform requires or checks for.
- Grepped the entire installed `@bankr/cli` again for `skill.md`, `well-known`, `agentres`: zero matches, same as `discoverable` before.

Nothing on our side is missing. Confirmed three separate ways now (CLI source, official docs, ecosystem convention check).

## The real finding: this is a known, unresolved, cross-seller Bankr bug

[`BankrBot/x402-cli-example#3`](https://github.com/BankrBot/x402-cli-example/issues/3) — open since **2026-07-01**, zero maintainer response in 3 months:

- Original reporter: 2 active, fully-configured endpoints, identical symptom to ours. Quotes Bankr's own launch materials: *"every **approved** x402 Cloud endpoint is automatically indexed in the agent discovery layer"* — asks what "approved" requires since nothing exposes it.
- Second, unrelated reporter (2026-08-29): 7 more active endpoints, same symptom, 7 days post-deploy, zero search hits. Also found `x402.bankr.bot` 404s on `/openapi.json` and `/.well-known/x402` — blocks third-party discovery (x402scan, AgentCash) too, not just Bankr's own search.
- [`Merit-Systems/x402scan#1110`](https://github.com/Merit-Systems/x402scan/issues/1110) has the technical detail on that second gap: Bankr's `402` challenge is missing the `extensions.bazaar` block Coinbase's Bazaar schema validation requires — 16 validation errors, no fix, no response.

Three independent accounts, two repos, three months, silence. Updated the draft report (`BANKR-SEARCH-VISIBILITY-BUGREPORT-DRAFT.md`) to cite all of this — it's a much stronger report now, not a lone confused developer.

## What I need from you — two real options, not mutually exclusive

**A. Close the loop and file, now (cheap, do this regardless):**
1. Still want your dashboard check (skipped last round) — confirm there's genuinely no manual toggle, for completeness, not because I expect one to exist anymore.
2. Post a comment on `BankrBot/x402-cli-example#3` with our own data (6 endpoints, the `discoverable: false` table, today's date) — a public paper trail with a currently-reproducing example is more likely to get Bankr's attention than a 4th silent report, and costs us nothing. You'll need your own GitHub auth for this (not the Mayakovsky org token if that's scoped differently) — use whatever account makes sense.
3. Also submit the finalized draft through whatever's the fastest real support channel Bankr has (in-app support widget on the dashboard, if there is one, might get more attention than GitHub given the GitHub issue's history) — check what's actually available when you're in there for step 1.

**B. Bigger, separate consideration — don't build this yet:** we already control `api.whitepapergrey.com` (it's where the bridge handlers point). We could in principle host our own `/.well-known/x402`, `/openapi.json`, and a Bazaar-schema-compliant 402 challenge directly from our own domain — sidestepping Bankr's broken discovery layer entirely and getting picked up by x402scan/AgentCash/Coinbase Bazaar on our own infrastructure, independent of whether Bankr ever fixes this. That's real new infrastructure and ongoing maintenance, not a quick fix — flagging it as a live option, not proposing we build it now. Worth Forces' eyes before it becomes a directive of its own.

Report back once A is done — that's the actionable round. I'll bring B to Forces separately as a strategic question, not an engineering task for you yet.
