// Layer 3 — shared "Type YES to confirm" prompt.

import process from 'node:process';
import { createInterface } from 'node:readline';

/** Prompt and return true only if the user typed exactly "YES". */
export async function confirmYes(
  prompt = 'Type YES to confirm: ',
  ask?: (q: string) => Promise<string>,
): Promise<boolean> {
  const asker =
    ask ??
    ((q: string): Promise<string> => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      return new Promise<string>((resolve) =>
        rl.question(q, (a) => {
          rl.close();
          resolve(a);
        }),
      );
    });
  const answer = (await asker(prompt)).trim();
  return answer === 'YES';
}
