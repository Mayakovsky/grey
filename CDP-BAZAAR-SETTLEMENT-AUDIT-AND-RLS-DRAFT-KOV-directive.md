# CDP BAZAAR — SETTLEMENT METHODOLOGY AUDIT + RLS POLICY DRAFT — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**Refs:** `CDP-BAZAAR-LOG-CONFIRM-AND-CRAWLER-CHECK-REPORT-KOV.md` (your last report — this follows
directly from two things you surfaced there: the unexplained empty `revenue_events` table, and the
RLS advisory).

Two independent tracks below. **Track A is the priority — security exposure on live infrastructure.**
Track B follows from your own report and needs to be settled before Task 2 (the crawler check) is
retried, so it's bundled here rather than as a separate round.

---

## Track A — RLS disabled on `grey_two`, draft policies for review (do NOT apply)

You found this: all 10 tables in `grey_two` (including `revenue_events`, `buyer_records`,
`sweep_log`, `refuel_log`) have RLS disabled, fully exposed to the anon key. Correctly not fixed
blind. Do this now:

1. For each of the 10 tables, determine what access `grey-core`'s actual runtime role needs
   (read/write, which columns, which operations) by tracing the real call sites — don't guess from
   table names.
2. Draft `ENABLE ROW LEVEL SECURITY` + specific policy statements scoped to a `grey_pipeline_rw`
   role (or whatever the actual runtime role is called — confirm the real role name from
   `grey-core`'s DB connection config, don't assume) for each table.
3. **Do not apply any of this.** Write the full SQL as a reviewable artifact. Flag anywhere you're
   not confident a policy is complete (e.g. anon should plausibly need zero access anywhere here,
   but say so explicitly per table rather than leaving it implied).

## Track B — Settlement methodology audit

**Why this matters, stated plainly:** `CDP-INDEXING-mainnet-test-KOV-directive.md` and
`CDP-INDEXING-real-resolution-six-checks-KOV-directive.md` — the directives behind settlements #3
and #4 — both specify a **scratch checkout with a real local Fastify server**, cleaned up
(`.env` copy deleted) after each run. That's a different process than the systemd-managed
`grey-core` unit actually reachable at `https://api.whitepapergrey.com`, which plausibly explains
why `revenue_events` is empty and `journalctl -u grey-core` shows nothing for those windows. What
it does **not** yet establish: whether the `resource.url` those settlements declared to CDP
(`https://api.whitepapergrey.com/v1/cdp/offerings/<slug>`) actually corresponded to anything real
and reachable at settlement time, or was just a hardcoded string in payload data pointing at a
domain the scratch process wasn't serving.

1. Reconstruct exactly how the scratch checkout was networked for settlements #3 and #4. Specific
   questions: what port did the scratch Fastify instance bind? Was the real `grey-core` systemd
   unit still running concurrently on 3002 during the test, or was it stopped? Was the scratch
   instance ever reachable at the public `api.whitepapergrey.com` hostname (e.g. via a temporary
   Caddy config change), or purely local/loopback?
2. If you can't reconstruct this from what's on disk now (scratch checkouts were deleted per those
   directives' own cleanup step), say so plainly — check `journalctl` system-wide (not just
   `-u grey-core`) around the settlement #3 timestamp (2026-08-04) and settlement #4 timestamp for
   any process bind/start evidence, and check `bash_history` / shell history on the VPS if
   accessible. Report what you can actually establish vs. what's unrecoverable — don't guess to
   fill the gap.
3. This determines how much weight settlements #3/#4 should carry as evidence in the ongoing GitHub
   thread. Don't post anything to GitHub yourself — that's Forces' call — just get Desktop the facts.

## Deliver

One report, both tracks, same convention as before (concrete evidence — SQL, log excerpts, exact
commands run — not summarized conclusions). Track A's SQL is the deliverable, not an action. Track
B is a factual reconstruction, explicitly marking anything unrecoverable as such.

Task 2 (the post-settlement crawler check) stays parked until Track B is in — once we know whether
future settlements need to go through the real deployed instance specifically (they should, but
confirm nothing else is quietly using the scratch-checkout pattern first), that's a fast follow-up,
not a new round.
