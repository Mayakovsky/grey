# Local Filesystem MCP Replacement — Report (Kov)

**Directive:** `LOCAL-FILESYSTEM-MCP-REPLACEMENT-KOV-directive.md` · **Path taken: Step 2 (thin proxy).**

**Do not paste this whole file into `claude_desktop_config.json`.** Merge the `mcpServers` entry below into the existing `mcpServers` object — not applied for you, same reason as `MCP-CONFIG-HANDOFF-FOR-FORCES.md`: no visibility into what else is in that file.

---

## Step 1 (easy fix) — checked, not available

- `typescript-sdk#2085` ("emit JSON Schema 2020-12 in tools/list") is **still open**, not merged — confirmed live against the PR itself (not cached), with a contributor comment noting the branch is "behind v1.x" and needs a rebase before it can even merge.
- Didn't stop at the PR status alone — actually ran the real, latest published package and inspected a live response. `@modelcontextprotocol/server-filesystem@2026.8.31` (resolves `@modelcontextprotocol/sdk@^1.30.0` → `1.30.0`, the current latest) still emits, on a real `tools/list` reply for `read_text_file`:
  ```json
  "inputSchema": { "$schema": "http://json-schema.org/draft-07/schema#", ... },
  "outputSchema": { "$schema": "http://json-schema.org/draft-07/schema#", ... }
  ```
  Confirms the directive's diagnosis exactly — this is the current published state, not a stale assumption. Moved to Step 2.

## Step 2 — the proxy

`C:\Users\kidco\dev\tools\filesystem-mcp-proxy.js` — spawns the real `@modelcontextprotocol/server-filesystem` via `npx`, passes every JSON-RPC message through unmodified, rewrites `$schema` from draft-07 to `https://json-schema.org/draft/2020-12/schema` inside `tools/list` responses only (both `inputSchema` and `outputSchema`, every tool). No change to the real server's logic — pure wire-level rewrite, same as the directive's starting point.

One real fix needed beyond the directive's starting-point code: spawning `npx` directly (or as `npx.cmd`) without `shell: true` threw `EINVAL` on this machine — confirmed by testing, not assumed. Using `shell: true` is the working option (accepted trade-off: this process's own argv here are plain directory paths, not attacker-controlled input).

**Verified end-to-end, not just that the label changes** (per the directive's explicit ask):
1. Spawned the proxy directly, sent a raw `initialize` + `tools/list` over stdio by hand.
2. Confirmed `read_text_file`'s `inputSchema.$schema` and `outputSchema.$schema` both come back as `https://json-schema.org/draft/2020-12/schema`.
3. Called the real `write_file` tool through the proxy against a scratch test file — succeeded, real file written to disk.
4. Called the real `read_text_file` tool through the proxy on that same file — content matched byte-for-byte what was written.

All four steps against the actual proxy process, not a mock.

## The `mcpServers` block

Scoped to exactly what's already consented for this machine (checked `remoteFolderConsentMemory` in `claude_desktop_config.json` directly — `C:\Users\kidco\dev\bion` and `C:\Users\kidco\dev\grey`, nothing wider):

```json
{
  "mcpServers": {
    "filesystem-fixed": {
      "command": "node",
      "args": [
        "C:\\Users\\kidco\\dev\\tools\\filesystem-mcp-proxy.js",
        "C:\\Users\\kidco\\dev\\bion",
        "C:\\Users\\kidco\\dev\\grey"
      ]
    }
  }
}
```

**Access granted:** the same five filesystem tools the broken first-party extension exposes (`read_text_file`, `write_file`, `list_directory`, `search_files`, `directory_tree`), restricted to the two already-consented directories above — no wider than what's already granted. No new permission surface; this only fixes the schema-dialect rejection.

## To apply

1. Open `claude_desktop_config.json` (Kov has not touched it).
2. Merge the `mcpServers` entry above into the existing `mcpServers` object (don't overwrite the three siblings already there — `bion-desktop-mail`, `bion-postgres`, `github`).
3. Restart Claude Desktop.
4. If the first-party `Filesystem` extension is still enabled separately, consider disabling it to avoid two servers offering overlapping tool names — your call, not assumed here.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
