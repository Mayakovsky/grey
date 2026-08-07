# VPS PULL — DOCS/MIGRATIONS ONLY, NO REBUILD — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.

## Context

`CDP-BAZAAR-SESSION-CLEANUP-GIT-REPORT-KOV.md` confirmed `/opt/grey/grey` is 7 commits behind
`origin/main` — all 7 are this session's migration + docs work, none touch `packages/grey-core` or
`packages/grey-sweeper`. Specifically needed there: `infra/deploy/deploy.md`'s new "local machine
vs. VPS" section, so future Kov instances working from that checkout actually see it.

## Task

On the VPS, in `/opt/grey/grey`:

```bash
git pull
```

**That's it — not the full `deploy.md` procedure.** No `pnpm install`, no `pnpm run build`, no
`systemctl restart grey-core`. Nothing in these 7 commits touches application code, so there's
nothing to rebuild and no reason to restart a running service for zero functional change. If `git
pull` reports anything touching `packages/` unexpectedly, stop and report rather than proceeding
to a rebuild — that would mean this scoping assumption was wrong and needs a second look before
anything gets rebuilt.

## Deliver

Confirm the pull landed clean (`git log --oneline -3` after), and confirm `grey-core` is untouched
— still running, same PID/uptime as before (`systemctl status grey-core --no-pager` or equivalent).
Short report on this part.

---

# PART 2 — CLASSIFY AND COMMIT THE UNTRACKED BACKLOG

**Separate task, same directive, per Forces.** `CDP-BAZAAR-SESSION-CLEANUP-GIT-REPORT-KOV.md` found
115 untracked files beyond this session's work, dating back to 2026-08-02 — the earlier CDP-BAZAAR
phase 1/2 backlog plus the entire BION/EXPANSION/MCP/Postgres/CDP-PHASE2/etc. threads. Forces wants
this resolved now, not left sitting: durable project record gets committed, genuine working/test
artifacts don't end up in the repo.

## Working hypothesis — confirm or correct it, don't just apply it blindly

- **`*-KOV-directive.md`, `*-REPORT-KOV.md`, `*-RUNBOOK-FORCES.md`, `*-DESKTOP-HANDOFF*.md`,
  `CORRECTION-*.md`, named planning/strategy docs** (`MARKET-EXPANSION-PROJECT.md`, the two "Grey
  Revenue Platform" docs, `EXPANSION-E2-SUMMARY.md`, etc.) — durable operational record, same
  category as what just got committed this session. **Commit these.**
- **The 13 `review-*.diff` files at repo root** — one-off review artifacts. For each: confirm via
  `git log`/`git show` that the corresponding change actually landed on `main` (match by branch
  name, commit message, or diff content — whatever's fastest to verify per file). If confirmed
  merged, it's redundant with git history — **don't commit, add to `.gitignore` instead**
  (`review-*.diff` as a pattern, so future ones don't reaccumulate the same way). If any diff does
  **not** correspond to a merged change, stop and flag that one specifically — don't gitignore
  something that might be the only record of unmerged work.
- **`stop-disable-cluster-a.ps1`** — looks like a one-off ops script from the Bion cluster work,
  not a reusable utility. Read it to confirm before deciding; if it's genuinely one-off and the
  situation it addressed is resolved, gitignore it rather than commit.
- **Anything that doesn't fit those patterns cleanly, or where you're not confident**: flag
  explicitly in the report, don't guess. Don't commit it and don't gitignore it — leave it
  untracked exactly as found and let Desktop/Forces make that specific call.

**Don't delete anything.** The ask is about what's in the *repo*, not what's on disk — `.gitignore`
solves that without giving up local reference copies. If something seems like a genuine candidate
for deletion, say so in the report; don't act on it.

## Commit discipline

Same as this session's cleanup: explicit paths, never `git add -A`. Group logically — by thread
(BION-*, EXPANSION-*, CDP-PHASE2-*, MCP-*, etc.) rather than one giant commit, same pattern as the
7 commits in the last round. Push when done.

## Deliver (Part 2)

- Full classification: what got committed (grouped, with commit messages), what got gitignored
  (and why — confirmation that the corresponding work is merged), what's flagged as ambiguous and
  left alone.
- Push confirmation.
- If the VPS checkout would benefit from this batch too (durable docs future Kov instances there
  should see), say so explicitly — don't pull it yourself beyond what Part 1 already authorized.

