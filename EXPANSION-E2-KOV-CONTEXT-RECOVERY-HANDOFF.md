# EXPANSION E2 — KOV CONTEXT RECOVERY HANDOFF

**From:** Desktop · **To:** Kov (context lost to an unexpected system shutdown, unrelated to your work) · **Date:** 2026-08-05
**Why this exists:** you were mid-way through `EXPANSION-E2-WRAP-CHECKS-KOV-directive.md` when the shutdown hit. No report was ever filed, so Desktop has no idea how far you got. This handoff re-orients you, then walks you through checking real state — not memory, not assumption — before you continue.

## 1. Standing rules, restated for a fresh context

- **Merge/push is Forces-gated, always, no exceptions.** Open the PR, get it reviewed, report ready, stop.
- Every directive where a diff needs review includes explicit export instructions (`git diff main..<branch> > review-*.diff`). Follow that convention even if a given directive forgets to restate it.
- Explicit git paths only, never `git add -A`. `vitest run` is canonical. No time estimates, ever. MCP/tool failure → retry ≤3, then stop and report.
- Creating any new account/identity on a third-party platform is Forces's action, never yours.
- **Given what just happened to you: don't trust your own prior partial work either, until you've checked it against real state.** A shutdown mid-write can leave a file half-written, a git stash uncommitted, or nothing at all. Verify before assuming, same discipline this project already applies to external claims.

## 2. Where E2 actually stands right now — context you're missing

- **E2-A** (chain abstraction) and **E2-BE** (Kite wallet topology + scoped sweep) — merged, done, retained. Not in question.
- **E2-C** — does not apply. Kite Agent Passport is a buyer-side identity/spending-guardrail product; Grey (as seller) has nothing to register there.
- **E2-D (listing)** — **dormant, not just "blocked pending invitation."** Forces actually went through Kite's real, current application process. It turned out to be a generic 5-question Typeform ending "thanks, we'll notify you" — no App Store branding, no dashboard, no OpenAPI submission step, no invitation code. The earlier docs describing a formal Step0/1/2 registration flow with a 24-hour invitation window were themselves confirmed **stale** — retired from Kite's current live site, only ever retrieved via a cached search snippet, never the live site itself (browser-confirmed 2026-08-04). **If any work-in-progress of yours assumed that Step0/1/2 flow or the 24-hour window is still real, discard those assumptions before writing anything referencing them.**
- `MARKET-EXPANSION-PROJECT.md` has been updated to reflect all of this — **OD-7 (§5.2) now reads "downgraded... likely dormant."** Read that entry directly rather than trusting this summary alone.
- Forces has decided to proceed to E3 in parallel rather than wait on E2-D. `EXPANSION-E3-OPENING-HANDOFF-KOV.md` already exists for whichever instance picks that up next — not your concern for this recovery task, just context.

## 3. What you were doing when the shutdown hit

`EXPANSION-E2-WRAP-CHECKS-KOV-directive.md` (full path: `C:\Users\kidco\dev\grey\EXPANSION-E2-WRAP-CHECKS-KOV-directive.md`) — four small, independent, mechanical items:

1. **G4 dedicated RPC app question** — confirm whether a managed RPC provider supports Kite mainnet yet; if not, wire in Kite's four regional public endpoints via fallback instead of the single global one.
2. **`.env.example`** — add `GREY_SWEEPER_GAS_FLOOR_WEI` with an explanatory comment.
3. **Bion — update `e2-cd`'s task status** to reflect reality. Note: use the *current* understanding from §2 above — "dormant," not the original directive's "blocked, no committed timeline" phrasing, which undersold how indefinite this now looks.
4. **`EXPANSION-E2-SUMMARY.md` + git tag** `movement-e2-kite-abstraction-baseline`. If you're writing or rewriting this now, write it around the corrected §2 understanding — don't let it describe the retired Step0/1/2 App Store narrative as if it were ever real and current.

**Desktop does not know which of these four you'd completed, partially completed, or hadn't started.** Check real state for each rather than guessing in either direction:

- `git status`, `git diff`, `git stash list` on the grey repo — anything uncommitted or stashed touching these four items?
- Read `.env.example` directly — is `GREY_SWEEPER_GAS_FLOOR_WEI` already there?
- Read the Kite registry entry directly — still the single `rpc.gokite.ai` endpoint, or already changed?
- Query Bion's current task state for `e2-cd` directly — don't assume it's still in whatever state the original directive described.
- Check whether `EXPANSION-E2-SUMMARY.md` exists at all, and if so, read it in full to see how complete/accurate it is against §2 above.
- `git tag -l` — does `movement-e2-kite-abstraction-baseline` already exist?

**Report back what you find for each of the four items — done / partially done / not started — before continuing.** Then finish whatever's outstanding.

## 4. Tone note

Forces has zero patience for vague status updates or hedged answers. Report facts plainly, cite file:line or command output for every claim, and if something's ambiguous, say so directly rather than picking a comfortable interpretation.

---
*Standby: report the real state of all four wrap-check items first, then proceed with what's actually left.*
