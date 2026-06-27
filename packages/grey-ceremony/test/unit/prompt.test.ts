import { describe, it, expect, beforeEach, vi } from 'vitest';

// readline is mocked so the prompt logic is testable without a real TTY: the
// fake interface hands back queued answers in order (one per question() call).
const hoisted = vi.hoisted(() => ({ queue: [] as string[] }));

vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_query: string, cb: (answer: string) => void): void => {
      cb(hoisted.queue.shift() ?? '');
    },
    close: (): void => {
      /* no-op for the mock */
    },
  }),
}));

import { promptPassphrase, promptNewPassphrase } from '../../src/prompt/passphrase.ts';

describe('promptPassphrase', () => {
  beforeEach(() => {
    hoisted.queue = [];
  });

  it('reads a line of input verbatim', async () => {
    hoisted.queue = ['correct horse battery staple inkwell radish'];
    await expect(promptPassphrase()).resolves.toBe('correct horse battery staple inkwell radish');
  });
});

describe('promptNewPassphrase', () => {
  beforeEach(() => {
    hoisted.queue = [];
  });

  it('rejects mismatched entries', async () => {
    hoisted.queue = ['entry-one', 'entry-two-different'];
    await expect(promptNewPassphrase()).rejects.toThrow('Passphrases do not match');
  });
});
