// grey-pipeline — withTimeout unit tests (M3.5 §19.2).
import { describe, it, expect } from 'vitest';
import { withTimeout, PIPELINE_TIMEOUT_MS } from '../src/utils/withTimeout';

describe('withTimeout', () => {
  it('resolves when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects with a labeled timeout error when the promise is too slow', async () => {
    const slow = new Promise((r) => setTimeout(() => r('late'), 100));
    await expect(withTimeout(slow, 5, 'unit')).rejects.toThrow(/unit timeout after 5ms/);
  });

  it('exposes the production 4-minute bound', () => {
    expect(PIPELINE_TIMEOUT_MS).toBe(240_000);
  });

  it('does not produce an unhandledRejection when an orphaned variant later rejects (§21)', async () => {
    const rejections: unknown[] = [];
    const handler = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', handler);
    try {
      // Variant rejects AFTER the timeout has already won the race → orphaned rejection path.
      const variant = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('orphan')), 50));
      await expect(withTimeout(variant, 10, 'unit')).rejects.toThrow(/unit timeout after 10ms/);
      // Wait past the orphan rejection time so any unhandled rejection would have fired.
      await new Promise((r) => setTimeout(r, 100));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});
