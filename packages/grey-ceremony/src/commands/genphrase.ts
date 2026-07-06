// Layer 3 command — `genphrase`: 6-word EFF diceware passphrase.

import process from 'node:process';
import {
  collectDiceWords,
  generateWords,
  isNonTtyAutoFallback,
  loadWordlist,
  makeStdinPrompter,
  resolveMode,
} from '../diceware/index.ts';
import type { ModeFlags } from '../diceware/index.ts';

export const WORD_COUNT = 6;

export interface GenphraseOptions {
  auto?: boolean;
  dice?: boolean;
}

/**
 * Resolve and produce the passphrase words for the given flags.
 * `ask` and `chooseManual` are injected so this is fully unit-testable.
 *
 * `chooseManual` is consulted only in interactive mode: it decides between the
 * default CSPRNG path ([Enter]) and the manual dice path ([d]).
 */
export async function runGenphrase(
  opts: GenphraseOptions,
  io: {
    isTty: boolean;
    ask?: (q: string) => Promise<string>;
    chooseManual?: () => Promise<boolean>;
    warn?: (msg: string) => void;
  },
): Promise<string[]> {
  const flags: ModeFlags = { auto: opts.auto, dice: opts.dice, isTty: io.isTty };
  const mode = resolveMode(flags); // throws on --auto + --dice
  const { byCode } = loadWordlist();

  if (isNonTtyAutoFallback(flags)) {
    io.warn?.('stdin is not a TTY; defaulting to --auto (CSPRNG) generation.');
  }

  if (mode === 'auto') {
    return generateWords(byCode, WORD_COUNT);
  }

  if (mode === 'dice') {
    if (!io.ask) throw new Error('Manual dice entry requires an interactive prompt');
    return collectDiceWords(byCode, io.ask, WORD_COUNT);
  }

  // interactive: offer CSPRNG (default) or manual dice
  const wantsManual = io.chooseManual ? await io.chooseManual() : false;
  if (wantsManual) {
    if (!io.ask) throw new Error('Manual dice entry requires an interactive prompt');
    return collectDiceWords(byCode, io.ask, WORD_COUNT);
  }
  return generateWords(byCode, WORD_COUNT);
}

/** CLI action: wire stdin prompts, print one space-separated line. */
export async function genphraseAction(opts: GenphraseOptions): Promise<void> {
  const isTty = Boolean(process.stdin.isTTY);
  let prompter: { ask: (q: string) => Promise<string>; close: () => void } | undefined;

  const ask = (q: string): Promise<string> => {
    if (!prompter) prompter = makeStdinPrompter();
    return prompter.ask(q);
  };

  const chooseManual = async (): Promise<boolean> => {
    const choice = (
      await ask('[Enter]=CSPRNG generate, [d]=manual dice entry: ')
    ).trim().toLowerCase();
    return choice === 'd';
  };

  try {
    const words = await runGenphrase(opts, {
      isTty,
      ask,
      chooseManual,
      warn: (m) => process.stderr.write(`${m}\n`),
    });
    process.stdout.write(`${words.join(' ')}\n`);
  } finally {
    prompter?.close();
  }
}
