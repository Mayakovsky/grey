# MCP TOOLING ACQUISITION — CORRECTION: NO DOCKER — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-05). Supersedes Task 1 and Task 4 of `MCP-TOOLING-ACQUISITION-KOV-directive.md` only. Tasks 2, 3, and 5 (Postgres role, package verification, handoff file) still stand as written.

## Correction

Docker is not actually a hard requirement for the GitHub server — `github.com/github/github-mcp-server`'s own README documents a `go build`-based local binary as a supported, Docker-free alternative. Separately, GitHub's own Claude-specific install docs flag an unresolved, currently-open compatibility issue between Claude Desktop and Docker-based MCP servers specifically. Given both, skip Docker entirely for this acquisition.

## Revised Task 1 — Check for `uv` and Go, not Docker

Check for `uv` (Postgres MCP Pro) and Go (GitHub MCP server) on this machine. Report what's present, what needs installing. Both are lightweight, no-daemon installs — if either has real friction here, report and hold rather than push through.

## Revised Task 4 — GitHub via a pinned Go binary, not Docker

- Check the repo's Releases page for the current stable tag. **Build from that pinned tag** — not `@latest`/`@main` — same pin-the-version reasoning as `postgres-mcp`.
- `go build` the `cmd/github-mcp-server` binary once to a static local path (preferred over re-fetching/rebuilding on every launch via `go run ...@tag`).
- Config runs the compiled binary directly with the `stdio` subcommand; `GITHUB_PERSONAL_ACCESS_TOKEN` goes in the env block. PAT itself is still Forces's to generate — unchanged.
- Confirm `--read-only` / `GITHUB_READ_ONLY=1` still strips write tools at this pinned tag before finalizing the handoff block.

## Task 5 — update the handoff file's GitHub block accordingly

`MCP-CONFIG-HANDOFF-FOR-FORCES.md`'s GitHub entry should point at the compiled binary's path + `stdio` args, not a `docker run` command. The Postgres block via `uv` is unchanged from the original directive.

## Deliver

Same as before: tool availability found, pinned versions/tags for both, handoff file path once ready.
