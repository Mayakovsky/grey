# MCP CONFIG HANDOFF — Postgres MCP Pro (Bion) + GitHub MCP Server

**From:** Kov · **To:** Forces · **Date:** 2026-08-05
**Per:** `MCP-TOOLING-ACQUISITION-KOV-directive.md` (Tasks 2/3/5) + `MCP-TOOLING-ACQUISITION-CORRECTION-NO-DOCKER-KOV-directive.md` (Tasks 1/4, superseding Docker with a pinned Go binary — an open Claude Desktop/Docker MCP compatibility issue, per Desktop's correction).

**Do not paste this whole file into `claude_desktop_config.json`.** Merge the `mcpServers` entries below into your existing config's `mcpServers` object — this handoff was deliberately not applied for you, since Kov has no visibility into what else is already in that file.

---

## Install methods actually used

- **uv** — not present on this machine before today; installed via `winget install --id astral-sh.uv` (v0.12.0). No daemon, user-scoped.
- **Go** — not present before today; installed via `winget install --id GoLang.Go` (go1.26.5). No daemon, user-scoped.
- Docker was **not** installed — per the correction directive, skipped entirely (the go-build local-binary path is a supported Docker-free alternative, and there's a documented open Claude Desktop/Docker MCP compatibility issue).

## Postgres MCP Pro — `bion-postgres`

- Package: `postgres-mcp` (PyPI), **pinned to `0.3.0`** — confirmed current/latest via PyPI's own JSON API (`pypi.org/pypi/postgres-mcp/json`, uploaded 2025-05-16). No open security advisories for `crystaldba/postgres-mcp` (checked the repo's Security Advisories tab directly — none published). The SQL-injection-bypasses-read-only issue that exists in this space is in the **deprecated Anthropic reference** Postgres MCP server (`@modelcontextprotocol/server-postgres`, archived 2025-07-10) — a different, unrelated package; not this one.
- `--access-mode=restricted` confirmed as the correct flag against the README at the `v0.3.0` tag specifically (not a cached/main-branch description).
- **Real friction found and resolved, not just documented:** ran the pinned package, not just read about it. Two real problems surfaced that a docs-only check would have missed:
  1. `postgres-mcp==0.3.0` depends on `pglast==7.2`, which has no prebuilt Windows wheel for this machine's system Python (3.14) — `uvx` defaulting to system Python tried a source build and failed (no C compiler on this box). Fixed by pinning `uvx` to an isolated Python **3.12** (`pglast` ships wheels through cp313; uv fetches its own 3.12 automatically, no system-wide install/compiler needed).
  2. `postgres-mcp==0.3.0`'s own dependency is unbounded (`mcp[cli]>=1.5.0`). `mcp` has since had a **major version bump to 2.0.0** which removed/renamed `mcp.server.fastmcp` — installing "just" `postgres-mcp==0.3.0` today pulls `mcp` 2.0.0 and the server fails to import. Fixed by pinning `mcp` alongside it to **`1.29.0`** — the last 1.x release (2026-07-28), i.e. the same major line `postgres-mcp==0.3.0` was actually built and tested against back in May 2025.
  Verified end-to-end after both fixes: launched the real command below against the real `bion_desktop_ro` connection string — `Starting PostgreSQL MCP Server in RESTRICTED mode` → `Successfully connected to database and initialized connection pool`.
- Also verified directly in the installed `postgres_mcp/server.py` source (not just `--help`, which doesn't document this): the DB connection string is read from **either** the `DATABASE_URI` env var **or** a positional CLI arg (env var wins if both are set) — `database_url = os.environ.get("DATABASE_URI", args.database_url)`. The config below uses the env var.
- **DB-level read-only, not just the MCP flag.** New role `bion_desktop_ro` on Bion's dedicated local Postgres cluster (`127.0.0.1:5433`, database `bion` — the isolated cluster, not the shared `:5432` one). `CONNECT` on the database, `SELECT`-only on all 12 tables in `public` (the only schema with real data — `agents`, `artifacts`, `decisions`, `events`, `fdqs`, `invariants`, `message_consumptions`, `messages`, `outbox`, `projects`, `schema_migrations`, `tasks`). Checked every table's contents before granting: none hold secrets/credentials — it's orchestration state (task descriptions, message bodies/paths, agent permission envelopes, cost/event payloads). No write grant exists at the DB level — verified directly: `UPDATE`/`DELETE` as this role return `permission denied for table ...`. Default privileges also set so tables Bion creates via future migrations (`bion_owner`-run) inherit the same `SELECT` grant automatically.
- Password is a fresh 32-char random alphanumeric, generated for this role specifically — not reused from `bion_rw` or `bion_owner`.

```json
{
  "mcpServers": {
    "bion-postgres": {
      "command": "uvx",
      "args": [
        "--python", "3.12",
        "--with", "mcp==1.29.0",
        "--from", "postgres-mcp==0.3.0",
        "postgres-mcp",
        "--access-mode=restricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://bion_desktop_ro:kp5r7elFVQqD0OiceCmJ9UoCYE4Kj2av@127.0.0.1:5433/bion"
      }
    }
  }
}
```

**Access granted:** read-only, `public` schema only, Bion's DB only. No access to any other schema/database, no write path at either the MCP layer or the Postgres role layer.

## GitHub MCP Server — `github`

- Repo: `github/github-mcp-server`. Latest stable release confirmed via the GitHub API directly (`api.github.com/repos/github/github-mcp-server/releases/latest` — not the summarized releases page, which mis-rendered the year): **tag `v1.8.0`**, published 2026-07-30, `prerelease: false`.
- Built from that pinned tag (commit `ca8ab52`, `git describe` → `v1.8.0-0-gca8ab52`) via `go build ./cmd/github-mcp-server`, **once**, to a static local path — not re-fetched/rebuilt on every launch:
  `C:\Users\kidco\.local\bin\github-mcp-server.exe`
- Confirmed in the pinned tag's own source (`cmd/github-mcp-server/main.go`): the `stdio` subcommand exists, `--read-only` is a real persistent flag, and Viper's env-prefix wiring (`SetEnvPrefix("github")` + `-`→`_` key replacement) means `GITHUB_READ_ONLY=1` maps onto it — both forms strip every write tool. Used the env-var form below.
- **The PAT is yours to generate** — not something Kov does on your behalf (same category as the key ceremony and the App Store application). Scopes needed: a **fine-grained PAT**, repository access scoped to `Mayakovsky/grey` (or whichever repos you want this to see), with **Contents: Read-only, Metadata: Read-only, Pull requests: Read-only, Issues: Read-only** — no write, no admin scopes on anything. `GITHUB_READ_ONLY=1` below is defense-in-depth on top of that, not a substitute for scoping the PAT itself narrowly.

```json
{
  "mcpServers": {
    "github": {
      "command": "C:\\Users\\kidco\\.local\\bin\\github-mcp-server.exe",
      "args": ["stdio"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<FORCES: PASTE YOUR FINE-GRAINED PAT HERE>",
        "GITHUB_READ_ONLY": "1"
      }
    }
  }
}
```

**Access granted:** read-only GitHub tools only (repos/issues/PRs/actions read paths) — no write, merge, push, or admin tools are exposed to the model at all; they're compiled in but the `--read-only`-equivalent env var strips them from what's offered.

## To apply

1. Open `claude_desktop_config.json` (Claude Desktop's own app config — Kov has not touched it).
2. Merge both `mcpServers` entries above into the existing `mcpServers` object (don't overwrite siblings already there).
3. Fill in the PAT placeholder after generating it on GitHub with the scopes noted above.
4. Restart Claude Desktop — this also ensures the just-installed `uv`/`uvx` and the Go-built binary's directory are picked up from a fresh process's `PATH`/absolute path (the binary is invoked by full path, so no PATH dependency there; `uvx` does rely on PATH, which winget already persisted to the user environment).
