import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// E2-BE (Forces ruling, EXPANSION-E2-BE-REVISED-KOV-directive.md): "do not integrate Lucid
// Multi-Bridge, or any bridge, this phase — Tier B holds settled Kite funds un-repatriated for
// now, a deliberate stopping point." This is a static guard, not just today's absence of code:
// it fails the moment anyone adds a bridge/repatriation code path, by accident or otherwise,
// before that decision is revisited. Mirrors packages/grey-ceremony/test/unit/no-math-random.test.ts's
// convention (source-grep guard against a specific reintroduction).
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Case-insensitive; matches identifiers/strings a real integration would need to introduce.
// Deliberately NOT matching "bridge" alone — this file's own doc comment above legitimately
// says "bridge", and so does config.ts's "no live Kite payment surface" style commentary
// elsewhere in the package; a bare substring match would trip on its own guard comment.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /lucid.?multi.?bridge/i,
  /\bcctp\b/i,
  /across\s*protocol/i,
  /bridge\.gokite\.ai/i,
  /bridgeToBase/i,
  /repatriat/i, // repatriate/repatriation — the concept this phase deliberately doesn't build
];

describe('no Kite→Base bridge/repatriation code path (static guard)', () => {
  it('no source file references a bridge integration or repatriation mechanism', () => {
    const offenders: Array<{ file: string; pattern: string }> = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) offenders.push({ file, pattern: pattern.source });
      }
    }
    expect(offenders).toEqual([]);
  });
});
