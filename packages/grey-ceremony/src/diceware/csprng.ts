// Layer 1 — cryptographically secure dice rolls.
//
// Uses node:crypto randomInt (a CSPRNG with rejection sampling) — NEVER a
// pseudo-random source — so generated passphrases have full entropy.

import { randomInt } from 'node:crypto';

/** Roll one fair die: an integer in [1, 6]. */
export function rollDie(): number {
  // randomInt(min, max) returns [min, max); request [1, 7) → 1..6.
  return randomInt(1, 7);
}

/** Roll five dice and return the 5-character code string (e.g. "31415"). */
export function rollCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += String(rollDie());
  }
  return code;
}

/**
 * Generate `count` random words from the supplied code→word map using fair
 * dice rolls. Default count is 6 (≈ 77.5 bits of entropy with the EFF list).
 */
export function generateWords(byCode: Map<string, string>, count = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = rollCode();
    const word = byCode.get(code);
    if (word === undefined) {
      throw new Error(`No word for code ${code}`);
    }
    out.push(word);
  }
  return out;
}
