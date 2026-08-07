# EXPANSION — E2 OPENING HANDOFF FOR KOV (fresh instance)

**From:** Desktop (architect) · **To:** Kov (implementer, new instance) · **For:** Forces (decides) · **Date:** 2026-08-04
**No prior-instance context assumed. Read this in full before doing anything.**

## 1. Who we are

Three roles: **Forces** decides and holds all authority. **Desktop** (Claude, architects/reviews) writes specs and reviews every diff before merge. **You (Kov)** implement in the terminal. All Kov communications are markdown files written to disk, never chat blobs. Diffs are the artifact of record.

**Standing rules that must hold without exception — two of these have been violated before this session, restated deliberately:**

- **Merge/push is Forces-gated, always, no exceptions.** Open the PR, get it reviewed, report ready, stop. Wait for Forces to explicitly say merge it before running `gh pr merge` or equivalent — even if the directive's urgency language is strong, even if the diff already passed review, even if it feels obviously safe. This has been violated twice already in this project's history. Don't make it three.
- **Every directive Desktop sends you where a diff needs review will include explicit export instructions** (`git diff main..<branch> > review-*.diff` at the repo root). Follow that convention on your own even if a directive forgets to state it.
- Explicit git paths only, never `git add -A`. `vitest run` is canonical. No time estimates, ever. MCP/tool failure → retry ≤3, then stop and report.
- **When Desktop tells Forces which directive file to send you, it's always the full absolute path** (e.g. `C:\Users\kidco\dev\grey\filename.md`) — if you ever see one abbreviated, something's wrong upstream, not a signal to guess.

## 2. Where things actually stand

- **E1 is fully live in production.** Pricing engine, EvaluationKit/Bazaar discovery metadata, the trust rung (built, blocked, per B-1 — do not lift without explicit Forces authorization), MCP surface, the revenue ledger — all merged, deployed, verified.
- **The CDP Facilitator / Bazaar-indexing saga is closed out, unresolved, and reported outward.** Short version: Grey's x402 payment rail also settles through Coinbase's CDP Facilitator now (a second, parallel path alongside Grey's own self-hosted settlement — self-hosted stays primary, CDP path exists purely for Bazaar discoverability). After five real wire-format bugs found and fixed, and two additional leads from an actual CDP/x402-foundation engineer checked directly against production bytes (one clean, one real and fixed), four independent real settlements across two networks still never appear in CDP's discovery catalog. This now looks like something on CDP's own side, not Grey's. A full report went to GitHub: `CDP-BAZAAR-INDEXING-FINAL-REPORT-for-github.md`. **Forces made the call to decouple this from E2 timing** — same reasoning as OD-6 (below). Don't reopen this investigation without new evidence Forces flags specifically.
- **The Market Expansion Project (MEP)** — `C:\Users\kidco\dev\grey\MARKET-EXPANSION-PROJECT.md` — is the ratified plan. **Read §3's E2 section directly before writing anything** — Kite, the specific phase breakdown, and the current gate criteria all live there, and this handoff deliberately doesn't restate them so you're working from the one authoritative source, not a possibly-stale summary.
- **§5's decision register (OD-1 through OD-6)** in that same document — read it. OD-6 specifically: the E1→E2 gate's "settled non-self payment" requirement is decoupled from E2 timing (real revenue doesn't exist yet on any channel; Forces chose not to let that block progress). OD-4 (B2B outreach timing) is still explicitly unresolved and Forces-gated — not yours to act on.
- **Bion** (the orchestration/task-tracking layer) has the full E1 backlog marked done. Its priority-number convention: **higher number = higher priority** (`ORDER BY priority DESC` — confirmed against the actual dispatcher source, not assumed). Author any new E2 tasks consistent with that.

## 3. What Desktop needs from you first

Read `MARKET-EXPANSION-PROJECT.md` §3's E2 phase breakdown in full. Once you have it, author the Bion tasks for E2's sub-phases (same pattern as E1's `e1-a` through `e1-f` — check Bion's task history for the exact shape) and report back with your understanding of E2's first buildable phase before writing any code. Desktop will confirm or correct that understanding and issue the actual build directive from there — this handoff is orientation, not the build spec itself.

## 4. Tone note, since it matters for how you report

Forces has zero patience for vague status updates, hedged answers, or being asked to do something Kov could just go check itself. Report facts plainly, cite file:line or real evidence for every claim, and when something's ambiguous, say so directly rather than picking a comfortable interpretation and hoping.

---
*Standby: confirm you've read the MEP's E2 section, then report your understanding of E2's first phase before starting.*
