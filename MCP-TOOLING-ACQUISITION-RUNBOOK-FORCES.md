# MCP TOOLING ACQUISITION — Forces' Part

**For:** Forces. Two things only you can do — everything else is Kov's, per `MCP-TOOLING-ACQUISITION-KOV-directive.md`.

## 1. Generate a GitHub personal access token

Creating a credential on your GitHub account is the one step Kov can't do on your behalf — same category as the key ceremony.

- GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** (preferred over classic — narrower scope).
- Scope it to **read-only**: `Contents: Read-only`, `Metadata: Read-only`, `Pull requests: Read-only`, `Issues: Read-only`. No write scopes — there's no reason this connection needs them.
- Restrict it to the specific repo(s) this is actually for (the `grey` repo, at minimum) rather than all repos, if the fine-grained token UI lets you scope by repository — narrower is better here regardless.
- Copy the token somewhere you can paste it into the config in step 3. It won't be shown again after you leave the page.

## 2. Confirm Docker is installed and running

Both Postgres MCP Pro and the GitHub server may end up running through Docker (Kov's directive has them check and consolidate on one toolchain if that's the lighter footprint). If Docker Desktop isn't already installed, install it and make sure it's running before step 3.

## 3. Wait for Kov's handoff, then merge it into your Claude Desktop config

Kov will produce `MCP-CONFIG-HANDOFF-FOR-FORCES.md` in `C:\Users\kidco\dev\grey\` with two ready-to-use `mcpServers` JSON blocks (Postgres MCP Pro, GitHub) and a note on what each one's access scope actually is.

- Open `%APPDATA%\Claude\claude_desktop_config.json` (create it with `{}` as the entire contents if it doesn't exist yet).
- **Merge** the two blocks from Kov's handoff into the existing `mcpServers` object — don't overwrite the whole file if anything else is already in there.
- Paste your GitHub PAT from step 1 into the placeholder in the GitHub block.
- Save.

## 4. Restart Claude Desktop

Fully quit and reopen — a reload isn't enough for MCP config changes to take effect.

## 5. Verify

Settings → Connectors (or the "+" button on the chat box → Connectors) should show both new servers connected. If either fails to connect, check `%APPDATA%\Claude\logs\mcp-server-*.log` for the specific error before troubleshooting blind.

Once both show connected, tell me and I'll confirm I can actually see Bion's task table and a real GitHub repo directly.
