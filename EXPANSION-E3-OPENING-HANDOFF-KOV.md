# EXPANSION — E3 OPENING HANDOFF FOR KOV (fresh instance)

**From:** Desktop (architect) · **To:** Kov (implementer, new instance) · **For:** Forces (decides) · **Date:** 2026-08-04
**No prior-instance context assumed. Read this in full before doing anything.**

## 1. Who we are

Three roles: **Forces** decides and holds all authority. **Desktop** (Claude, architects/reviews) writes specs and reviews every diff before merge. **You (Kov)** implement in the terminal. All Kov communications are markdown files written to disk, never chat blobs. Diffs are the artifact of record.

**Standing rules that must hold without exception:**

- **Merge/push is Forces-gated, always, no exceptions.** Open the PR, get it reviewed, report ready, stop.
- **Every directive Desktop sends you where a diff needs review will include explicit export instructions** (`git diff main..<branch> > review-*.diff` at the repo root). Follow that convention on your own even if a directive forgets to state it.
- Explicit git paths only, never `git add -A`. `vitest run` is canonical. No time estimates, ever. MCP/tool failure → retry ≤3, then stop and report.
- **When Desktop tells Forces which directive file to send you, it's always the full absolute path.**
- **Creating any new account or identity on a third-party platform is Forces's action, never yours** — even if research shows it's technically something you could execute (an API call, a form submission). This came up concretely in E2 and holds for E3 too if anything similar surfaces there.

## 2. The E2 lesson, stated plainly because it's directly relevant to how you should approach E3

MEP's E2-C/E2-D text described Kite's identity/listing mechanics confidently and was **wrong** — Agent Passport turned out to be a buyer-side system with no relevance to Grey as a seller; the real seller mechanism (Agent App Store) is a differently-named, invitation-gated component MEP didn't mention. This wasn't caught by trusting the plan; it was caught by fetching Kite's own docs directly and reading what they actually said. **E3's own spec (`MARKET-EXPANSION-PROJECT.md` §3 E3-A) already anticipates this exact risk for Olas** — it says outright: *"Olas now supports x402... verify this at spec time; it is the difference between a config expansion and a new-language adapter."* Treat that as an instruction, not a footnote. Before building anything, verify Olas's actual current mechanics against Olas's own docs/sources, the same way E2-BE verified Kite's real chain id, real USDC contract, and real bridge support before writing code — not from MEP's prose, and not from this handoff.

## 3. Where things actually stand

- **E1 is fully live in production.** Pricing engine, EvaluationKit/Bazaar discovery metadata, the trust rung (built, blocked, per B-1 — do not lift without explicit Forces authorization), MCP surface, the revenue ledger — all merged, deployed, verified.
- **E2 is wrapped, in a partial-completion state that's been explicitly accepted, not glossed over.** Chain abstraction (E2-A) and Kite wallet topology + scoped sweep (E2-BE) are merged and retained — that's the real, durable deliverable E3 depends on. Agent Passport registration (E2-C) doesn't apply at all (see §2 above). Listing/App Store presence (E2-D) is blocked on **OD-7** — Kite's App Store invitation, Forces-executed, no committed timeline. E2's gate to E3 is 2-of-3 met; Forces elected to proceed to E3 in parallel rather than block the whole project on a third-party invitation queue. Full detail: `EXPANSION-E2-SUMMARY.md` (once written) and `MARKET-EXPANSION-PROJECT.md` §3 E2 / §5.2 OD-7, both updated 2026-08-04.
- **The CDP Facilitator / Bazaar-indexing saga is closed out, unresolved, and reported outward** — unrelated to E3, don't reopen it. Full report: `CDP-BAZAAR-INDEXING-FINAL-REPORT-for-github.md`.
- **The Market Expansion Project (MEP)** — `C:\Users\kidco\dev\grey\MARKET-EXPANSION-PROJECT.md` — is the ratified plan. **Read §3's E3 section directly before writing anything.** This handoff deliberately doesn't restate E3's phase content so you're working from the one authoritative source. Read §5's decision register too — **OD-2 (Olas rail: x402-over-Olas primary, Python Mech Tool fallback) is already ratified** and directly shapes E3-A; OD-4 (B2B outreach) and OD-7 (Kite App Store) are open/in-progress and not E3's concern but worth knowing about.
- **Bion** has E1's and E2's real work marked `done` (`e2-a`, `e2-be`); `e2-cd` sits blocked on OD-7. Author E3's sub-phase tasks the same way E1's and E2's were authored — check Bion's task history for the exact shape before assuming it.

## 4. What Desktop needs from you first

Read `MARKET-EXPANSION-PROJECT.md` §3's E3 phase breakdown in full, including E3-A's rail-decision language. Do the real-precedent verification described in §2 above for Olas's actual current x402 support before forming an opinion on E3-A. Author the Bion tasks for E3's sub-phases, then report your understanding of E3's first buildable phase — and your findings on the x402-over-Olas question specifically — before writing any code. Desktop will confirm or correct that understanding and issue the actual build directive from there.

## 5. Tone note, since it matters for how you report

Forces has zero patience for vague status updates, hedged answers, or being asked to do something Kov could just go check itself. Report facts plainly, cite file:line or real evidence for every claim, and when something's ambiguous, say so directly rather than picking a comfortable interpretation and hoping. This is exactly the discipline that caught the Kite mistake in MEP before it cost real build time on E3 — keep applying it.

---
*Standby: confirm you've read the MEP's E3 section and done the Olas verification, then report your understanding of E3's first phase before starting.*
