# BION SHADOW-MODE REVIEW → E3 CUTOVER TRIAL — DESKTOP HANDOFF

**For:** whichever Desktop instance picks this up.
**From:** prior instance, 2026-08-06.
**Sequencing:** comes right after a quick look at the CDP Bazaar thing (separate instance, separate handoff) — not blocked on it, just the stated order of business.

## The actual goal — not just an assessment

**Cut Bion over to live dispatch for a scoped portion of E3, and see how it actually performs under real conditions.** Bounded trial, not the whole project, not indefinite. Shadow-mode review is the input to that decision, not the deliverable itself — don't stop at "here's how accurate shadow mode looks" without also producing the trial plan.

## Start here — infrastructure is already resolved, don't re-litigate it

`BION-CUTOVER-EVALUATION-OPENING-CONTEXT.md` has the full current picture. Both arcs that were previously open are now **closed and proven**, not open questions:
- **Daemon liveness:** found dead (~27h, `LogonType: Interactive` — dies on logoff/sleep/reboot), fixed to S4U, heartbeat-staleness alerting built and proven against a real deliberate outage.
- **Postgres resilience:** cluster registered as a real Windows Service (was a bare manually-started process with zero recovery mechanism), a real race condition between the service's own Recovery and the daemon's old self-healing was found and fixed during proof testing, retry window audited and widened (6s → 450s).

Start from "the infrastructure is reliable" and go straight to the actual shadow-mode data — `auto.shadow` (93 events), `reactive.shadow` (39), `reactive.dispatch`/`reactive.halt` (78/74), `auto.dispatch`/`auto.halt` (28/28), spanning 2026-06-14–08-02 — for accuracy and drift analysis. **That same doc flags that a batch of shadow/dispatch-shaped events from the 2026-08-06 test-suite run carry synthetic fixture values** (`proj-<hex>`, literal `"x"`) — filter those out before treating raw event counts as real signal; check for other test-run contamination the same way.

## The design question that has to get answered before any trial plan means anything

`BION_AUTO_MODE` (`off`/`shadow`/`on`) — **confirm whether this is a global setting only, or can be scoped to a specific project/task-set.** If it's global-only, "just E3, just a trial" needs some other enforcement mechanism (e.g., only E3 tasks exist/are ratified during the trial window, a task-level owner/project filter in the dispatch logic itself, something else) — don't assume a clean per-project toggle exists without checking the actual code. This is a real open question, not a detail to wave past.

## What to actually produce

1. **Shadow-mode accuracy assessment** against the real historical data — where Bion's shadow decisions matched what actually happened, where they diverged, and by how much. Real numbers, not an impression.
2. **A concrete definition of "ready"** — not vibes. Accuracy threshold, drift tolerance, an explicit rollback plan if the trial goes wrong mid-flight.
3. **A scoping plan for the E3 trial specifically** — what's in scope, what the kill switch actually is, how success/failure gets measured during the trial window.
4. **Only then, if the above supports it:** the actual cutover action for the trial's scope, with Forces's explicit authorization — same standing discipline as every Forces-gated action this project runs on. Don't flip anything live without that sign-off, however confident the analysis looks.
