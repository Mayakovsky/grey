// Layer 1 — passphrase prompt over a TTY via readline. Keystrokes echo to the
// terminal (single-operator threat model; operator is responsible for terminal-
// window hygiene per the §6.1 runbook). For the M4.5 public extraction, the
// default should flip back to masked with an opt-in flag, since downstream users
// will not share the single-operator threat model. See the M4.5 scope discussion.

import process from 'node:process';
import { createInterface } from 'node:readline';

/**
 * Prompt for a passphrase on the TTY. Keystrokes echo normally — no masking
 * (single-operator threat model; see the module header).
 */
export async function promptPassphrase(query = 'Passphrase: '): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer: string = await new Promise((resolve) => rl.question(query, resolve));
    return answer;
  } finally {
    rl.close();
  }
}

/**
 * Prompt twice and require the two entries to match (used when creating a new
 * keystore). Throws if they differ.
 */
export async function promptNewPassphrase(): Promise<string> {
  const first = await promptPassphrase('New passphrase: ');
  const second = await promptPassphrase('Confirm passphrase: ');
  if (first !== second) {
    throw new Error('Passphrases do not match');
  }
  return first;
}
