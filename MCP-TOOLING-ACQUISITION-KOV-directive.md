# MCP TOOLING ACQUISITION — Postgres MCP Pro + GitHub MCP — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-05). Goal: give Desktop (this Claude Desktop instance) direct read access to Bion's task DB and to GitHub, so review stops depending entirely on markdown reports being re-piped through the context window.

**Correction up front:** an earlier message from Desktop showed an example config using `npx -y @crystaldba/postgres-mcp` — **that package doesn't exist.** Postgres MCP Pro is a Python tool (PyPI: `postgres-mcp`), not an npm package. Don't use that example; use the verified install methods below.

## Task 1 — Check what's actually on this machine before picking an install method

Check for `uv`, `pipx`, and Docker, in that order of preference (lightest footprint first). Report what's present. Pick the best-fit method based on what's actually there rather than defaulting to installing a new package manager if one's already usable. If none of the three exist, report that and hold rather than silently installing a new toolchain — that's a bigger footprint decision worth a heads-up, even if small.

## Task 2 — Dedicated read-only Postgres role for Bion's DB

This is the real safety boundary, not the MCP server's own `--access-mode` flag alone (that flag is enforced by the server, but a DB-level restriction holds even if the server has a bug — this is exactly the lesson from the deprecated Anthropic Postgres server, whose "read-only" mode didn't actually block writes).

- Create a new role, least-privilege: `CONNECT` on the `bion` database, `SELECT`-only on whatever schema(s)/tables actually hold task/project state — not a blanket grant across every schema. Check what's actually in there first; if anything looks like it holds secrets or credentials rather than task data, exclude it explicitly rather than grant broadly and rely on nobody querying it.
- Generate a real password for this role (not a placeholder). This credential's purpose is scoping *Desktop's* connection, not hiding anything from you — you already have full admin access to this database — so there's no special handling needed beyond normal credential hygiene (goes in the config handoff, not committed anywhere).

## Task 3 — Verify the `postgres-mcp` package itself

- Confirm current version on PyPI (`pypi.org/project/postgres-mcp/`) and pin that exact version rather than letting install float to whatever's newest later — same reasoning as the general MCP supply-chain caution Desktop flagged (registries have been shown to accept malicious packages on submission; pinning costs nothing and closes that specific door).
- Check for any open security advisories specific to `crystaldba/postgres-mcp` (GitHub Security tab, PyPI advisory feed) — confirm none exist before proceeding. If any do, report and hold.
- Confirm `--access-mode=restricted` is still the correct flag for enforced read-only in the current pinned version (verify against the actual README at that version tag, not a cached description).

## Task 4 — GitHub: local Docker route, not remote OAuth (correction)

**Correction to Desktop's own earlier assumption:** the GitHub remote MCP server's OAuth flow is not currently supported by Claude Desktop specifically (confirmed directly against `github.com/github/github-mcp-server`'s own Claude installation guide) — that path works for Claude Code, not Desktop. For Desktop, it's the **local Docker container** (`ghcr.io/github/github-mcp-server`) with a **`GITHUB_PERSONAL_ACCESS_TOKEN`**, not a URL/OAuth entry.

- Confirm Docker is (or will be) available — this makes Docker a real requirement, not just Task 1's lightest-footprint preference. If Docker ends up installed for this anyway, consider running Postgres MCP Pro via Docker too (`docker pull crystaldba/postgres-mcp`) rather than a second toolchain (`uv`/`pipx`) — one new dependency instead of two. Your call based on what Task 1 finds; note the reasoning either way.
- **The PAT itself is Forces's to generate** — creating a credential on a third-party account (GitHub) is the same category as the key ceremony and the App Store application: not something you do on Forces's behalf. Leave a placeholder in the config handoff (Task 5) and a one-line note on what scopes to grant (read-only repo access is all this needs — no write scopes).
- Confirm `ghcr.io/github/github-mcp-server` is still the correct image and that `--read-only` / `GITHUB_READ_ONLY=1` is still the flag that strips write tools, against the current docs — don't assume from a cached description.

## Task 5 — Draft the config handoff, don't touch Forces's actual config file

Write a file — `MCP-CONFIG-HANDOFF-FOR-FORCES.md`, in `C:\Users\kidco\dev\grey\` — containing:
- The exact `mcpServers` JSON block for Postgres MCP Pro (using the new role's real connection string, the pinned version, `--access-mode=restricted`, whichever launch method Task 1/4 determined).
- The exact `mcpServers` JSON block for the GitHub local Docker server, with `GITHUB_PERSONAL_ACCESS_TOKEN` left as a clearly-marked placeholder for Forces to fill in, `--read-only`/`GITHUB_READ_ONLY=1` set.
- A one-line note on which access-mode/scopes each grants, and exactly what PAT scopes Forces needs to select when generating the token, so Forces isn't pasting in something unreviewed or guessing at scopes.

**Do not edit `claude_desktop_config.json` yourself.** That's Forces's personal app config, not a project repo file, and you don't have visibility into whatever else might already be in it — a blind merge risks clobbering something unrelated. Hand off the exact block; Forces merges it.

## Deliver

Report: which install method Task 1 chose and why, the new role's name (not its password, in chat — that goes in the handoff file only), the pinned `postgres-mcp` version and confirmation of no open advisories, confirmation of the GitHub URL, and the handoff file's path.
