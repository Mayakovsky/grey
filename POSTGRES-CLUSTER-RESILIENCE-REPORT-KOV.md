# Postgres Cluster Resilience — Check Before Fixing — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-06
**Refs:** `POSTGRES-CLUSTER-RESILIENCE-KOV-directive.md`

## Headline: there are two separate Postgres clusters on this machine, and the "Manual by design" belief maps onto the wrong one

Diagnostic only, per Task 3 — nothing stopped, restarted, or reconfigured. But the facts don't match the framing in the directive's own "Update from Forces" section, and that's worth correcting before any decision gets made on top of it.

## Task 1 — Real current state, both clusters

### Cluster A — the registered Windows Service (`postgresql-x64-16`), port 5432

This is **not** Bion's cluster — it's the standard system-wide install at `C:\Program Files\PostgreSQL\16\data`, unrelated to the MCP/Bion dependency chain. Found only because `Get-Service -Name *postgres*` surfaces it too, and it's on the same box, so reporting it in full:

```
Name: postgresql-x64-16
Status: Running
StartType (Get-Service): Automatic
sc.exe qc:  START_TYPE : 2   AUTO_START
sc.exe qfailure: RESET_PERIOD 0, no recovery actions configured (default "take no action" on crash)
BINARY_PATH_NAME: "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" runservice -N "postgresql-x64-16" -D "C:\Program Files\PostgreSQL\16\data" -w
SERVICE_START_NAME: NT AUTHORITY\NetworkService
```

**This directly contradicts the "Manual was very likely intentional" belief** — whatever Forces was picturing, this service is `AUTO_START`, currently `Running`, and has no recovery-on-crash configured (not that it needs it much, since Automatic-on-boot is already the main persistence mechanism). If the belief was about *this* Postgres install, it's wrong; there was no deliberate Manual choice here to preserve.

**`listen_addresses`, literal config value:** `C:\Program Files\PostgreSQL\16\data\postgresql.conf:60`:
```
listen_addresses = '*'
```
Confirmed live via `Get-NetTCPConnection`, not just the config file: pid 7412 (this service) listening on **both** `0.0.0.0:5432` and `:::5432` — every interface, IPv4 and IPv6, not loopback-restricted. This resolves the "genuinely bound to loopback or something broader" question directly: **broader.**

**Mitigating factor, checked directly rather than assumed:** `pg_hba.conf` for this cluster only grants `scram-sha-256` auth to `127.0.0.1/32` and `::1/128` (plus the Unix-socket-equivalent `local` line) — no rule for any wider subnet or `0.0.0.0/0`. So while the TCP listener itself is wide open, nothing outside loopback can actually complete authentication today. That's real protection, but it's protection by a second, independent layer (`pg_hba.conf`) rather than by the listener itself being scoped — worth knowing precisely rather than either overstating this as "wide open" or understating it as "effectively loopback-only," since a firewall change or a `pg_hba.conf` edit down the line would remove the *only* thing currently standing between `listen_addresses='*'` and real exposure.

### Cluster B — Bion's actual dedicated cluster, port 5433

This is the one the directive is really about — the one I manually start via `scripts/pg-start.sh`, the one `bion-postgres` MCP and `BionDaemon` both depend on.

**Not registered anywhere, by any mechanism — checked all three, not assumed:**
- `Get-Service -Name *postgres*` — only returns Cluster A above; no second service.
- `Get-ScheduledTask` filtered for `*pg*`/`*postgres*` — zero results.
- `HKCU`/`HKLM` `...\CurrentVersion\Run` registry keys — grepped for `postgres`/`bion`/`pg_ctl`/`5433` — zero matches.

It runs only because a human (or I) ran `pg-start.sh`. There is no Windows-level autostart, no crash recovery, nothing — this is the "bare manually-started process has no recovery mechanism at all" scenario the directive named, confirmed factually rather than inferred from "I had to start it once."

**`listen_addresses`, literal config value:** `~/.bion-pg/data/postgresql.conf:60`:
```
#listen_addresses = 'localhost'		# what IP address(es) to listen on;
```
Commented out — the file itself doesn't set it. But the actual enforced value doesn't come from the file: `pg-start.sh` passes `-o "-p $PGPORT -c listen_addresses=127.0.0.1"` on every manual start, overriding the (irrelevant, commented-out) file default at the command line each time. Confirmed live: pid 11476 listening **only** on `127.0.0.1:5433` — nothing else, no `::1`, no wildcard. Loopback-only, exactly as `provision-db.sh`'s own comments describe ("Dedicated isolated cluster: 127.0.0.1:5433"). This one matches its documented design intent precisely.

## Task 2 — The real tradeoff, laid out plainly

- **Exposure question: resolved, and it's Cluster A (the unrelated one) that's actually broad, not Cluster B (Bion's).** Bion's own dependency chain is fine on the exposure axis today. Whatever the "Manual, deliberately" belief was meant to protect, it isn't currently doing that for the service it would apply to.
- **Availability/cutover question: this is the real, live conflict, and it's about Cluster B, not A.** `BionDaemon`'s own liveness fix — the heartbeat-staleness alerting just built and proven — is only as good as Postgres actually being up for the daemon to connect to and write a heartbeat about in the first place. Right now, if this machine reboots, `BionDaemon` (once its own fix lands, or even today via the `AtLogOn` trigger) will start, but Bion's Postgres cluster **will not** — nothing brings port 5433 back on its own. The daemon does have its own best-effort bring-up logic (`ensureClusterUp` in `daemon.ts`, already observed running `pg-start.sh`-equivalent logic on tick errors), which is worth noting as a partial mitigation already in the codebase — but that's a reactive retry inside the daemon process, not the same as the cluster surviving independently of whether the daemon happens to be the one to notice it's down.
- **Bion cutover to live dispatch depends on this database being available without a human starting it first** — same class of problem the daemon's own `Interactive`-logon-type fragility was, and not yet resolved by anything shipped so far.

**Forces's actual decision, once ready:** whether Bion's own :5433 cluster should get *some* persistence mechanism (even something as light as folding a "is it up, if not start it" check into `BionHeartbeatCheck`'s own S4U-triggered run, which already exists and already runs every minute independent of session state — no new task needed, just an addition to what it does) — versus leaving it exactly as-is, manual-only, matching whatever the original "avoid running a local DB when not in use" intent actually was. Separately and independently: whether Cluster A's `AUTO_START` + `listen_addresses='*'` combination (which nobody seems to have actually intended, going by the directive's own framing) is something Forces wants changed at all, given it's outside Bion's dependency chain entirely.

## Task 3 — Held

Nothing stopped, restarted, or reconfigured on either cluster this round. Both are exactly as found: Cluster A running/Automatic/wildcard-bound-but-pg_hba-restricted, Cluster B running (because I started it earlier this session)/no-autostart-mechanism/loopback-only.

## Deliver

- Startup Type: Cluster A (`postgresql-x64-16`, port 5432, unrelated to Bion) = `AUTO_START`/Running, contradicting the "Manual, deliberate" belief. Cluster B (Bion's actual cluster, port 5433) = not a service at all, no autostart mechanism of any kind, confirmed via service/task/registry checks, not assumed.
- `listen_addresses`: Cluster A = literal config `'*'`, confirmed live on `0.0.0.0`+`::`, but `pg_hba.conf` restricts real auth to loopback only. Cluster B = config commented out but runtime-forced to `127.0.0.1` via `pg-start.sh`'s `-c` override every start, confirmed live, loopback-only in practice and in effect.
- No fix applied. Standing by for Forces's decision on both the Cluster B persistence tradeoff and, separately, whether Cluster A's unintended Automatic/wildcard config is worth a look even though it's outside Bion's own chain.
