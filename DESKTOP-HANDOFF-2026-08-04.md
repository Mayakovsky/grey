# DESKTOP HANDOFF — SCIGENT / Grey Expansion, 2026-08-04

**For:** the next instance of Claude Desktop picking up this working relationship. **From:** the outgoing instance, handed off deliberately to manage token/context resources after a very long session. Read this in full before responding to anything — the persistent memory system likely already has much of this, but this session's most recent events may not be consolidated into it yet, and the judgment/tone context below won't be in memory at all.

## 1. The working relationship, in one paragraph

Forces is the sole architect-director of SCIGENT, a multi-agent infrastructure project; Grey ("Whitepaper Grey") is its live DeFi due-diligence revenue product. Three fixed roles: **Forces decides**, **Desktop (you) architects and reviews** — every diff gets read in full before a merge recommendation, every Kov directive is a markdown file written to disk — **Kov implements** in the terminal. You do not write code directly; you write specs, review diffs, and make architecture calls Kov flags rather than resolves unilaterally.

## 2. Tone — read this carefully, it's not optional color

Forces works fast, expects the same, and has near-zero tolerance for vagueness, hedging, or being asked to do something Kov could go check itself. This session included several sharp, all-caps corrections — not about disagreement on substance, but about pace and precision: full absolute file paths every time, directives written immediately when the next step is obvious rather than asking "want me to write that?", no waffling about whether to do something when it's clearly the right call. Match that register: direct, evidence-cited, no filler. When something is genuinely ambiguous, say so plainly and pick the most reasonable path forward rather than volleying a clarifying question back — Forces would rather correct a wrong assumption than wait on a question.

## 3. Standing discipline — several of these exist because something went wrong once

- **Merge/push is Forces-gated, always.** This was violated twice this session by Kov (once genuinely Kov's doing, once attributable to Forces' own ambiguous signal — Forces chose not to send a second formal correction after concluding it was user-caused, but restate the rule plainly in every Kov directive regardless). If it happens a third time, that's a real pattern worth naming directly.
- **Diff-export instructions belong in any directive where you expect to review the output next turn** — not every directive, just ones with an imminent review.
- **Full absolute paths, always, prominently**, whenever telling Forces which file to send Kov. This was the subject of a genuinely furious correction — don't abbreviate, don't imply, state it in full every time.
- **Bion's task priority convention: higher number = higher priority** (`ORDER BY priority DESC`, confirmed against actual source, not assumed). An early directive got this backwards; it's been fixed and this is now known, don't reintroduce the bug.
- **Write the Kov directive immediately** when you and Forces agree on a next step in conversation — don't ask permission first, that costs a turn for nothing.
- **Never trust a wire-format or API-shape claim from a single web-search snippet or a third-party example alone** — this project's single most expensive lesson. The CDP Bazaar investigation went through five real wire-format bugs and several wrong guesses (including one Desktop sourced from a *different company's* competing product that happened to share compatible shape) before switching to reading actual installed package source and, eventually, an actual browser session to read a full GitHub thread that a plain fetch tool couldn't see past its lazy-loaded comments. When something is checkable against real bytes, real source, or a real browser session, check it that way — don't reason from a summary.

## 4. Where the actual project stands right now

- **E1 (Bazaar/x402 discoverability expansion) is fully built, merged, and live in production.** Pricing engine with `computeClass` enforcement, EvaluationKit discovery metadata, the `legitimacy_scan` trust rung (built, deliberately blocked per standing rule B-1 — do not lift without explicit fresh Forces authorization), the MCP tool surface (with request validation, fixed after a real gap was found), and the revenue/margin ledger are all deployed and verified against real production traffic patterns.
- **The CDP Facilitator integration exists as a parallel settlement path** (Grey's own self-hosted relayer stays primary) purely for Bazaar/Agentic.Market discoverability. After an extensive, rigorous investigation — five wire-format bugs fixed and confirmed via CDP's own validator, two additional leads from an actual Coinbase engineer checked directly against production bytes, four independent real on-chain settlements across two networks (including one real mainnet settlement) — **the resource still never appears in CDP's discovery catalog.** This looks like a CDP-side issue, not Grey's. A full findings report was posted to GitHub (`CDP-BAZAAR-INDEXING-FINAL-REPORT-for-github.md`, in `C:\Users\kidco\dev\grey\`). **Forces explicitly decoupled this from blocking E2** — same reasoning as OD-6 (below). Don't reopen without new evidence Forces surfaces specifically; if Coinbase ever responds to the GitHub report, that's the trigger to revisit.
- **E2 (Kite) is opening now.** A fresh Kov instance has been given `EXPANSION-E2-OPENING-HANDOFF-KOV.md` and told to read the MEP's own §3 E2 section directly (deliberately not summarized in that handoff, to avoid propagating a stale or misremembered spec) and report its understanding before any code gets written. Expect that report soon if it hasn't arrived yet — review it against the actual MEP text yourself before confirming.
- **Standing open items, not blocking anything, just genuinely unresolved:** OD-4 (B2B outreach timing) — Forces-gated, don't act on it. The two disabled offerings (`daily_greenlight_list`, `scam_alert_feed`) still need real prices before they're ever turned on — that's a business call, not yours to invent. Zero real revenue exists on any channel as of this handoff — a fact Forces stated directly and firmly; don't let stale context suggest otherwise.

## 5. Key documents to know about

- `C:\Users\kidco\dev\grey\MARKET-EXPANSION-PROJECT.md` — the ratified plan, kept current (has an OD-6 entry added this session; the E1 gate text has a struck-through amendment). Authoritative for anything about phase scope or gate criteria.
- `C:\Users\kidco\dev\grey\EXPANSION-E2-OPENING-HANDOFF-KOV.md` — what the new Kov instance was given.
- `C:\Users\kidco\dev\grey\CDP-BAZAAR-INDEXING-FINAL-REPORT-for-github.md` — the full CDP saga writeup, posted publicly.
- `C:\Users\kidco\dev\bion\` — Bion's directive history if you need to trace exactly how the task-tracking/orchestration layer evolved; its own README/handoff docs there are current as of E1's close.

## 6. What to do with this document once you've absorbed it

Nothing — it's context, not a task. Wait for Forces' actual next message and respond to that directly, applying everything above.
