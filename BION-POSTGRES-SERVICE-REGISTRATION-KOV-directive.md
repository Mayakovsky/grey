# BION POSTGRES CLUSTER — REGISTER AS SERVICE — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED. Closes `POSTGRES-CLUSTER-RESILIENCE-KOV-directive.md`'s open tradeoff — Forces's decision: register Bion's cluster (port 5433) as a real Windows Service, matching the pattern the unrelated system Postgres install (`postgresql-x64-16`) already proves works, rather than folding process-supervision into `BionHeartbeatCheck`. Cluster A (port 5432, wildcard-bound) gets traced for possible ElizaOS-era orphan status (Task 4) — investigate and report, but nothing destructive without a separate go-ahead.

## Task 1 — Bake `listen_addresses` into the config file directly, before registering anything

`~/.bion-pg/data/postgresql.conf` currently has it commented out, with the loopback restriction enforced only by `pg-start.sh`'s runtime `-c` flag. That script won't be in the loop anymore once this is a service — uncomment and set `listen_addresses = '127.0.0.1'` directly in the file. Confirm this is the only place enforcing it before moving on; don't leave a stale runtime override anywhere that could contradict the file.

## Task 2 — Register as a Windows Service

Use `pg_ctl register` (or whatever this Postgres version's standard mechanism is — confirm rather than assume it matches Cluster A's exact invocation, since that one may have come from the official installer's own setup rather than a manual `pg_ctl register` call). Needs:
- Automatic startup type.
- Recovery configured to restart on failure — reasonable backoff, not a tight crash loop, matching the reasoning already applied to `BionHeartbeatCheck`'s design.
- Appropriate `SERVICE_START_NAME` — check what permissions the data directory actually needs before defaulting to matching Cluster A's `NT AUTHORITY\NetworkService` blindly.

This needs elevation. Same pattern as the last three fixes: prepare the exact script, confirm it's syntactically valid before handoff, hand it to Forces with explicit instructions on which elevated shell to use and how to run it — don't attempt registration from your own session.

## Task 3 — Prove it, the same standard as the last two fixes

Once Forces confirms registration: deliberately kill the Postgres process and confirm Windows' own Recovery mechanism brings it back without anyone starting it manually. Separately, confirm — don't assume — that `listen_addresses` is still `127.0.0.1`-only post-migration, live (`Get-NetTCPConnection`), not just in the config file.

## Task 4 — Trace Cluster A (port 5432): likely ElizaOS-era orphan, kill if confirmed dead

Forces's hypothesis: this predates the M6 cutover, from when the ElizaOS pm2 agent was the live architecture, and never got cleaned up after ElizaOS was decommissioned. Trace before acting — confirm, don't assume:

- What databases actually exist inside Cluster A (`\l`-equivalent)? Does the schema/content match anything ElizaOS-shaped (check against whatever ElizaOS's own schema looked like, if that's still recoverable from repo history) versus something clearly still in active use?
- Any current code in `grey` or `bion` repos referencing port 5432 or this install, live or in `.env`/config? If everything active uses Supabase Cloud (grey) or port 5433 (Bion), that's a strong signal nothing depends on this.
- Service install/creation timestamp, cross-referenced against the M6 ElizaOS-decommission timeline — does it line up?
- Any live connections to it right now, or in whatever logs exist, from anything other than your own investigation?

**If the trace confirms it's dead** (no active dependents, content/timeline consistent with the ElizaOS era, nothing connecting to it): stop the service and set it to Disabled — that alone neutralizes both the wildcard-exposure question and the orphaned-resource question without touching any data. **Do not drop the actual data or uninstall anything** — stopping and disabling is reversible, deletion isn't; report your evidence and hold there for an explicit go-ahead on anything destructive.

## Task 5 — Clean up test-fixture noise in Bion's `tasks` table

Since you'll already be in this database: the `tasks` table is mostly dev-test debris from Bion's own build — rows like `a`/`b`/`c`/`root`/`child`/`m1`/`unratified`/`try to self-ratify`/`cli-created`/`unscoped`/`elsewhere`/`formatted task`, and synthetic `autofix-*` rows with placeholder failure text (`"1/1 failing: x"`, `"1/3 failing: a > b"`). Real project rows are only `e2-a`, `e2-be`, `e2-cd`, `e1-e` — confirm that exact set before deleting anything, don't rely on a fuzzy heuristic that might catch something real. Query and list every row you're about to delete first, cross-check it excludes the known-real set, then delete, and report the exact count and IDs removed — auditable, not a silent bulk operation.

## What this doesn't need to include

Don't touch `BionDaemon` or `BionHeartbeatCheck`. Cluster A gets traced (Task 4) but nothing destructive happens to it without a separate go-ahead.

## Deliver

Confirmation `listen_addresses` is baked in (Task 1), the registration script ready for Forces (Task 2), and once Forces runs it: the deliberate-kill test result and the live loopback-only confirmation (Task 3). Separately: Cluster A's trace evidence and whatever action followed (Task 4), and the exact task-cleanup report (Task 5).
