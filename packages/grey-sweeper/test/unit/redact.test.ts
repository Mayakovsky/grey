import { describe, it, expect } from 'vitest';
import { redactError } from '../../src/errors.js';

describe('redactError (FDQ-56) — no secret survives into a persisted row/log', () => {
  it('strips a keyed RPC URL; no `http` substring and no key survive', () => {
    const err = new Error(
      'RPC Request failed. URL: https://base-mainnet.g.alchemy.com/v2/SECRETKEY123 Request body: {...}',
    );
    const out = redactError(err);
    expect(out).not.toContain('http');
    expect(out).not.toContain('alchemy.com');
    expect(out).not.toContain('SECRETKEY123');
    expect(out).toContain('[url-redacted]');
  });

  it('reproduces the exact FDQ-56 leak (viem eth_sendRawTransaction error) and neutralizes it', () => {
    const viemMsg =
      'The method "eth_sendRawTransaction" does not exist. URL: https://base-mainnet.g.alchemy.com/v2/abcdefKEY body';
    const out = redactError(viemMsg);
    expect(out).not.toMatch(/http|alchemy\.com|abcdefKEY/);
  });

  it('strips key=/token=/secret= segments even without a URL', () => {
    const out = redactError(new Error('auth failed apiKey=abc123 token: xyz9 secret=hunter2'));
    expect(out).not.toMatch(/abc123|xyz9|hunter2/);
  });

  it('passes a clean message through unchanged and handles non-Error input', () => {
    expect(redactError(new Error('post-swap WETH balance 0 below minOut 105'))).toBe(
      'post-swap WETH balance 0 below minOut 105',
    );
    expect(redactError('replacement transaction underpriced')).toBe('replacement transaction underpriced');
  });
});
