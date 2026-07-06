import { describe, it, expect } from 'vitest';
import {
  codeToWord,
  collectDiceWords,
  generateWords,
  isNonTtyAutoFallback,
  isValidDiceCode,
  loadWordlist,
  resolveMode,
} from '../../src/diceware/index.ts';
import { runGenphrase } from '../../src/commands/genphrase.ts';

const { byCode, words } = loadWordlist();
const wordSet = new Set(words);

describe('diceware CSPRNG', () => {
  it('generates 6 words, all in the EFF list', () => {
    const out = generateWords(byCode, 6);
    expect(out).toHaveLength(6);
    for (const w of out) expect(wordSet.has(w)).toBe(true);
  });

  it('--auto yields exactly 6 space-separated EFF words', async () => {
    const out = await runGenphrase({ auto: true }, { isTty: false });
    expect(out).toHaveLength(6);
    const line = out.join(' ');
    expect(line.split(' ')).toHaveLength(6);
    for (const w of out) expect(wordSet.has(w)).toBe(true);
  });
});

describe('dice code validation', () => {
  it('accepts a valid code and resolves a word', () => {
    expect(isValidDiceCode('31415')).toBe(true);
    expect(typeof codeToWord(byCode, '31415')).toBe('string');
  });

  it('rejects 4 digits, an out-of-range digit, and non-digits', () => {
    expect(isValidDiceCode('3141')).toBe(false); // too short
    expect(isValidDiceCode('31418')).toBe(false); // 8 out of range
    expect(isValidDiceCode('abcde')).toBe(false); // non-digits
    expect(() => codeToWord(byCode, '3141')).toThrow();
    expect(() => codeToWord(byCode, '31418')).toThrow();
    expect(() => codeToWord(byCode, 'abcde')).toThrow();
  });
});

describe('three-mode UX', () => {
  it('--auto + --dice is a hard error', () => {
    expect(() => resolveMode({ auto: true, dice: true, isTty: true })).toThrow(
      /mutually exclusive/,
    );
  });

  it('non-TTY with no flags resolves to auto', () => {
    expect(resolveMode({ isTty: false })).toBe('auto');
    expect(isNonTtyAutoFallback({ isTty: false })).toBe(true);
  });

  it('flags resolve to their modes', () => {
    expect(resolveMode({ auto: true, isTty: true })).toBe('auto');
    expect(resolveMode({ dice: true, isTty: true })).toBe('dice');
    expect(resolveMode({ isTty: true })).toBe('interactive');
  });

  it('runGenphrase rejects --auto + --dice', async () => {
    await expect(runGenphrase({ auto: true, dice: true }, { isTty: true })).rejects.toThrow(
      /mutually exclusive/,
    );
  });
});

describe('manual dice assembly', () => {
  it('assembles 6 words from 6 valid codes (re-prompting on bad input)', async () => {
    // pick 6 real codes from the list
    const codes = ['11111', '22222', '33333', '44444', '55555', '66666'];
    for (const c of codes) expect(byCode.has(c)).toBe(true);

    // feed: one invalid attempt for the first word, then the valid codes in order
    const feed = ['9z', ...codes];
    let i = 0;
    const ask = (): Promise<string> => Promise.resolve(feed[i++]);

    const out = await collectDiceWords(byCode, ask, 6);
    expect(out).toHaveLength(6);
    expect(out).toEqual(codes.map((c) => byCode.get(c)));
  });

  it('runGenphrase --dice collects via the injected prompter', async () => {
    const codes = ['12345', '54321', '13524', '24531', '15243', '32451'];
    let i = 0;
    const ask = (): Promise<string> => Promise.resolve(codes[i++]);
    const out = await runGenphrase({ dice: true }, { isTty: true, ask });
    expect(out).toEqual(codes.map((c) => byCode.get(c)));
  });
});
