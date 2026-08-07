# EXPANSION E2-BE — BLOCKED before Task 1: `e2-a` has not actually landed

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-BE-KOV-directive.md`.
**Status:** STOPPED before any Bion restructuring, branching, or code. No tasks ratified, no branch created, nothing written except this report.

## The directive's premise doesn't match the repo

`EXPANSION-E2-BE-KOV-directive.md` states "**Depends on:** `e2-a` ... Confirm whether it's merged to main before branching" and, further down, "**Ratify `e2-a`** — its build directive is authorized and has landed." I checked before touching anything, per the directive's own standing instruction (§"Before writing anything") and the 2026-08-04 handoff's rule against trusting a claim that's checkable against real source. It does not hold up against any of the three places that would show it:

1. **No branch exists, anywhere.** `git branch -a` and `git fetch --all --prune` (both run just now, from `C:\Users\kidco\dev\grey`) show no `expansion-e2-a-chain-abstraction` — not local, not on `origin`. Full branch list is CDP/M6/phase-f work only; nothing E2-shaped except this directive itself.
2. **No PR exists.** `gh pr list --repo Mayakovsky/grey --state all --limit 30` shows PR #34/#35/#36 as the E1-A / E1-round2 merges (2026-08-02) and then straight into the CDP Facilitator/Bazaar-indexing PR chain (#37–#45, 2026-08-02 through 2026-08-04). No E2-A entry at any state (open/closed/merged).
3. **No code exists.** The exact files the E2-A directive (`EXPANSION-E2-A-KOV-directive.md`) specifies as its deliverable are still in their pre-refactor, Base-only shape:
   - `packages/grey-schemas/src/pricing/types.ts:28` — still `export type Channel = 'x402' | 'acp';`, no `'kite'`.
   - `packages/grey-schemas/src/pricing/table.ts:93` — `NETWORK_MULTIPLIER` has no `kite` entry.
   - `adapters/x402-middleware/src/config.ts` — no `registry`/`Registry` token anywhere in the file; still the direct `loadX402Config()` env-read shape my E2 opening report originally cited.
4. **Bion's own task row confirms it.** `pnpm task list --project expansion` (from `C:\Users\kidco\dev\bion\repo`, just now) shows:
   ```
   e2-a  [backlog]  ratified=false  owner=kov  project=expansion  prio=1  deps=-  "Chain abstraction refactor..."
   ```
   Still backlog, still unratified — unchanged since I authored it in the opening-report turn. Nothing has moved it.

So: the E2-A *directive document* exists on disk (`EXPANSION-E2-A-KOV-directive.md`, authored per the confirmation of my opening report), but the *build* it specifies never happened. Nobody dispatched it and I have no record of executing it in this thread. Whatever produced "e2-a is authorized and has landed" as a premise for this new directive, it isn't reflected in the branch list, the PR history, the source tree, or the task database — the four places that would actually show completed work.

## Why I'm stopping here rather than improvising

`EXPANSION-E2-BE-KOV-directive.md` explicitly scopes this build to E2-B (wallet topology) + E2-E (sweeper extension) only — "What this phase explicitly does not do" doesn't mention building E2-A, because the directive assumes it's already done. Building E2-A myself right now, un-asked, would be scope creep on a **key-custody-and-fund-movement directive** ("the highest-stakes diff in E2 so far" per its own line 7) — exactly the kind of unilateral judgment call the standing rules say to flag rather than resolve quietly. Wiring `KITE_PAY_TO` "into the E2-A chain registry" (Task 1's last bullet) is also not possible yet — that registry doesn't exist in the tree to wire anything into.

I also have not touched the Bion task graph. Ratifying `e2-a`, or merging `e2-b`+`e2-e` into `e2-be` and merging `e2-c`+`e2-d` into `e2-cd`, would record a task graph that asserts `e2-a` is done when it demonstrably isn't — I'd rather report the mismatch than write a false state into the tracker.

## What I need from you before proceeding

One of these, plainly:
- **E2-A never actually got built, and this directive's premise was wrong** — in which case, should I build E2-A first (under a fresh directive, or as an addendum to this one), then proceed to E2-BE on top of it in the same or a follow-up pass?
- **E2-A was built somewhere I don't have visibility into** (a different clone, a different branch naming convention, a session/instance I'm not continuous with) — in which case, point me at the actual branch/commit so I can verify and branch `expansion-e2-be-kite-wallet-sweeper` from the right base, per the directive's own instruction to state that base commit explicitly.

Either way, I'm not proceeding with Task 1 (Bion restructuring), branching, or any wallet/sweeper code until this is resolved. Standing by.
