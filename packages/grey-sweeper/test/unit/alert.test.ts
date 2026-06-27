import { describe, it, expect, vi } from 'vitest';
import { alertCritical, alertOperational } from '../../src/alert.js';
import type { AlertDeps, HttpPost } from '../../src/alert.js';

function deps(post: HttpPost): AlertDeps {
  return {
    opsUrl: 'https://ntfy/ops',
    critUrl: 'https://ntfy/crit',
    post,
    delay: async () => {}, // no real backoff in tests
  };
}

describe('alertOperational', () => {
  it('posts to ops URL with priority 3 and returns true on 200', async () => {
    const post = vi.fn<HttpPost>(async () => ({ statusCode: 200 }));
    const ok = await alertOperational('hello', deps(post));
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, opts] = post.mock.calls[0]!;
    expect(url).toBe('https://ntfy/ops');
    expect(opts.headers['Priority']).toBe('3');
    expect(opts.body).toBe('hello');
  });
});

describe('alertCritical', () => {
  it('posts to crit URL with priority 5 + rotating_light tag', async () => {
    const post = vi.fn<HttpPost>(async () => ({ statusCode: 200 }));
    const ok = await alertCritical('reactor down', { x: 1 }, deps(post));
    expect(ok).toBe(true);
    const [url, opts] = post.mock.calls[0]!;
    expect(url).toBe('https://ntfy/crit');
    expect(opts.headers['Priority']).toBe('5');
    expect(opts.headers['Tags']).toBe('rotating_light');
    expect(opts.body).toContain('reactor down');
    expect(opts.body).toContain('"x":1');
  });
});

describe('alert retry / backoff', () => {
  it('retries up to 3 attempts then returns false WITHOUT throwing', async () => {
    const post = vi.fn<HttpPost>(async () => ({ statusCode: 500 }));
    const result = await alertOperational('x', deps(post));
    expect(result).toBe(false);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('does not throw when transport rejects every attempt', async () => {
    const post = vi.fn<HttpPost>(async () => {
      throw new Error('network down');
    });
    const result = await alertCritical('boom', {}, deps(post));
    expect(result).toBe(false);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('succeeds on a later attempt without exhausting retries', async () => {
    let n = 0;
    const post = vi.fn<HttpPost>(async () => {
      n++;
      return { statusCode: n < 2 ? 503 : 204 };
    });
    const ok = await alertOperational('eventual', deps(post));
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });
});
