# POSTGRES CLUSTER RESILIENCE — CHECK BEFORE FIXING — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED.
**Why:** you had to manually start Bion's Postgres cluster during the `bion-postgres` MCP setup. That's a real signal it may not currently auto-start or auto-restart on this machine — same class of problem as `BionDaemon`, potentially worse, since a bare manually-started process has no recovery mechanism at all. Everything downstream depends on this: `BionDaemon`, all of Bion's task tracking, and Desktop's own direct DB access now too.

**Update from Forces:** the Manual startup type was very likely intentional — a deliberate choice to avoid running a local DB server when not actively in use, not a misconfiguration. Do not change Startup Type or Recovery settings without Forces's explicit go-ahead. This directive is now diagnostic-only until that decision is made.

## Task 1 — Determine the real current state, don't assume either way

- Is Postgres registered as a Windows Service right now? (`Get-Service -Name *postgres*`, or check Services.msc directly.)
- What's its actual current Startup Type and Recovery config? Confirm it matches what Forces believes was set (Manual), rather than assuming.
- **Confirm the actual `listen_addresses` value in `postgresql.conf`** (or wherever it's configured) — is this genuinely bound to loopback (`127.0.0.1`/`localhost`) only, or something broader? This directly answers Forces's own security question with real evidence instead of an instinct — report the literal config value and, ideally, confirm with a quick `netstat`/`Get-NetTCPConnection` check of what interface it's actually listening on while running.

## Task 2 — Report findings and the real tradeoff; do not act on Startup Type without Forces

Lay out plainly for Forces: the actual `listen_addresses` finding (resolves the exposure question), and the direct conflict between Manual start and any future autonomous/unattended operation (Bion's own cutover depends on this database being available without a human starting it first). This is Forces's decision, not a default to configure around.

## Task 3 — Hold

Do not stop/restart Postgres deliberately or change any settings this round — this task is diagnostic and reporting only, pending Forces's decision on Task 2's tradeoff.

## Deliver

Task 1's real findings — confirmed Startup Type, confirmed `listen_addresses` value, and however the service check comes out. No fix to apply this round; report and stand by for Forces's decision.
