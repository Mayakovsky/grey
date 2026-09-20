# Replace the broken first-party Filesystem extension with our own MCP server — directive for Kov

**From:** Claude Desktop · **To:** Kov · **Context:** Claude Desktop's bundled first-party `Filesystem` extension is broken on this machine — every tool call (`read_text_file`, `write_file`, `list_directory`, `search_files`, `directory_tree`) fails with an identical error:

```
Tool '<name>' has an invalid outputSchema: JSON Schema declares an unsupported dialect
("$schema": "http://json-schema.org/draft-07/schema#"). The default validator supports
JSON Schema 2020-12 only
```

This is a confirmed, widely-reported upstream bug (not our config): Claude Desktop's bundled MCP client rejects any tool schema that *declares* the draft-07 dialect, even though the MCP spec (SEP-1613) says a declared dialect should be honored. The Filesystem extension's schemas are stamped draft-07 by an older `zod-to-json-schema` dependency. It affects the Desktop/Cowork app specifically — **not** Kov's own Claude Code CLI stack, which already runs a client version that isn't affected. No app update is available yet to fix it on Forces' end.

We're not waiting on Anthropic. `bion-postgres` and `github` already prove the pattern: a user-configured entry in `claude_desktop_config.json`'s `mcpServers` works fine in Desktop/Cowork sessions, completely independent of the broken first-party extension. Build a replacement the same way.

## Task

### Step 1 — try the easy fix first

Check whether the upstream fix has already shipped: `@modelcontextprotocol/server-filesystem`'s underlying SDK dependency has an open PR (`modelcontextprotocol/typescript-sdk#2085`, "emit JSON Schema 2020-12 in tools/list") that may or may not be merged/released yet — confirm its actual state (merged? released? what SDK version?) rather than trusting anything pre-written here.

If a current `@modelcontextprotocol/server-filesystem` version + its resolved SDK dependency both emit 2020-12-dialect schemas now: just add it as a normal `mcpServers` entry (pinned to that confirmed-good version, same discipline as `bion-postgres`/`github`'s pinning). Done, skip Step 2.

### Step 2 — if not, build the thin proxy (confirmed workaround, documented in `anthropics/claude-code#87633`)

A small Node.js stdio wrapper that sits between Claude Desktop and the real filesystem server: passes every JSON-RPC message through unmodified, except it rewrites `$schema` from draft-07 to `https://json-schema.org/draft/2020-12/schema` inside any `tools/list` response before forwarding it upstream. This doesn't touch the real server's logic at all — pure schema-string rewrite on the wire.

```javascript
// filesystem-mcp-proxy.js — spawns the real filesystem server, rewrites
// declared $schema from draft-07 to 2020-12 in tools/list responses only.
import { spawn } from 'node:child_process';

const allowedDir = process.argv[2];
if (!allowedDir) {
  console.error('usage: node filesystem-mcp-proxy.js <allowed-directory>');
  process.exit(1);
}

const server = spawn('npx', ['-y', '@modelcontextprotocol/server-filesystem', allowedDir], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

process.stdin.pipe(server.stdin);

let buf = '';
server.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(line + '\n');
      continue;
    }
    const tools = msg?.result?.tools;
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        for (const key of ['inputSchema', 'outputSchema']) {
          if (tool[key]?.$schema) {
            tool[key].$schema = 'https://json-schema.org/draft/2020-12/schema';
          }
        }
      }
    }
    process.stdout.write(JSON.stringify(msg) + '\n');
  }
});

server.on('exit', (code) => process.exit(code ?? 0));
```

This is a starting point, not a finished artifact — verify it actually round-trips correctly against the real server (a schema that's genuinely draft-07-shaped under the hood, just relabeled, could theoretically hit a stricter downstream check on some other keyword; confirm real reads/writes work end-to-end, not just that the label changes) before treating it as done.

- Save it somewhere sensible (e.g. `C:\Users\kidco\dev\tools\filesystem-mcp-proxy.js` — your call).
- Scope it to the same folders already consented for this machine (`C:\Users\kidco\dev\bion`, `C:\Users\kidco\dev\grey` — check `remoteFolderConsentMemory` in `claude_desktop_config.json` for the current list; don't widen scope beyond what's already granted without asking).
- New `mcpServers` entry, e.g.:
  ```json
  "filesystem-fixed": {
    "command": "node",
    "args": ["C:\\Users\\kidco\\dev\\tools\\filesystem-mcp-proxy.js", "C:\\Users\\kidco\\dev"]
  }
  ```
- Test locally first (`node filesystem-mcp-proxy.js <dir>`, feed it a raw `tools/list` JSON-RPC request by hand or via the MCP inspector, confirm `$schema` comes back as `2020-12` and the underlying tool call still actually reads/writes real files) before it ever touches Claude Desktop's config.

## Deliver

1. Report which path you took (Step 1 easy fix, or Step 2 proxy) and why.
2. Give me the exact `mcpServers` JSON block to hand to Forces — same handoff shape as `MCP-CONFIG-HANDOFF-FOR-FORCES.md` (what it is, what access it grants, exactly what to merge into the config and where).
3. **Do not edit `claude_desktop_config.json` yourself** — same rule as the original MCP tooling acquisition: Kov delivers the block, Forces merges it and restarts Desktop, same reason as before (you have no visibility into what else is already in that file).
4. One `LOCAL-FILESYSTEM-MCP-REPLACEMENT-REPORT-KOV.md`, same convention.

This is independent of, and doesn't block, the Bankr offerings directive — different problem, same posture (build it, don't wait).
