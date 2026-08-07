# PRODUCTION REQUEST LOGGING — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-05).
**Why:** the CDP crawler-method investigation hit a total blind spot — Caddy has no `log` directive on `api.whitepapergrey.com`, and Fastify was built with `logger: false`. There is currently no way to answer "did a request actually arrive, with what method, at what time" for this service, for any question, not just this one. Close that gap.

## Task 1 — Caddy access logging (do this one; low-risk, edge-level, no app code touched)

Add a `log` directive to the `api.whitepapergrey.com` block in `/etc/caddy/Caddyfile`, JSON format, reasonable local rotation (e.g. `roll_size`, `roll_keep`, `roll_keep_for` — check current Caddy version's actual directive names rather than assuming syntax from memory). Reload Caddy, confirm with a live test request that a log line actually lands where expected before considering this done.

## Task 2 — Fastify's `logger: false`: investigate before touching

`packages/grey-core/src/server/index.ts:40` has this explicitly set, not defaulted. **Check why before flipping it** — `git log -p` / `git blame` on that line. If there's a documented reason (performance, log-volume cost, a prior incident), report it and hold rather than override a deliberate decision silently. If it looks like an unexamined default with no real rationale behind it, flag that finding and propose turning on Fastify's own request logging at a reasonable level (not full body logging — method/path/status/latency is the useful set, same as what Caddy's access log gives at the edge, so this may end up redundant with Task 1 rather than necessary on top of it).

## What this doesn't need to be

Not a full observability platform, not structured log shipping to a third-party service, not anything requiring new infrastructure decisions. Local files, reasonable rotation, enough to answer "what hit this service and when" the next time it matters.

## Deliver

Confirm Task 1 live (a real test request showing up in the log). Report Task 2's finding (the reason `logger: false` was set, if one exists) and your recommendation before changing it.
