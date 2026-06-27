// Layer 1 — masked passphrase prompt over a TTY via readline.

import process from 'node:process';
import { createInterface } from 'node:readline';
import type { ReadLine } from 'node:readline';

/**
 * Prompt for a passphrase on the TTY, masking keystrokes so the secret is not
 * echoed. Falls back to reading a plain line when stdin is not a TTY.
 */
export async function promptPassphrase(query = 'Passphrase: '): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Mask each emitted character with '*'. readline still receives the real
  // input; only the visible echo is replaced.
  const muteOutput = (rlAny: ReadLine): void => {
    const r = rlAny as unknown as {
      output?: { write: (s: string) => void };
      _writeToOutput?: (s: string) => void;
    };
    r._writeToOutput = (stringToWrite: string): void => {
      if (!r.output) return;
      if (stringToWrite.includes(query)) {
        r.output.write(query);
      } else if (stringToWrite === '\r\n' || stringToWrite === '\n') {
        r.output.write('\n');
      } else {
        r.output.write('*');
      }
    };
  };

  if (process.stdin.isTTY) {
    muteOutput(rl);
  }

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
