import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { zero, zeroAll } from '../../src/memory/index.ts';

describe('memory zeroing', () => {
  it('zeros a buffer in place', () => {
    const buf = randomBytes(32);
    zero(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('zeroAll zeros multiple buffers and skips nullish', () => {
    const a = randomBytes(8);
    const b = randomBytes(8);
    zeroAll(a, null, b, undefined);
    expect(Buffer.compare(a, Buffer.alloc(8))).toBe(0);
    expect(Buffer.compare(b, Buffer.alloc(8))).toBe(0);
  });
});
