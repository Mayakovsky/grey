import { setTimeout as sleep } from 'node:timers/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { request } from 'undici';

/**
 * Injectable HTTP transport so tests don't hit the network. Matches the subset
 * of `undici.request` we use.
 */
export type HttpPost = (
  url: string,
  opts: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ statusCode: number }>;

const defaultPost: HttpPost = async (url, opts) => {
  const res = await request(url, opts);
  return { statusCode: res.statusCode };
};

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export interface AlertDeps {
  /** Credential-free ntfy topic URL (e.g. https://ntfy.whitepapergrey.com/grey-ops). */
  opsUrl: string;
  /** Credential-free ntfy topic URL (e.g. https://ntfy.whitepapergrey.com/grey-crit). */
  critUrl: string;
  /** ntfy Basic-auth username — sent as a header, NEVER embedded in the URL (FDQ-43). */
  user: string;
  /** ntfy Basic-auth password — sent as a header, NEVER embedded in the URL (FDQ-43). */
  pass: string;
  post?: HttpPost;
  /** Override sleep for deterministic tests. */
  delay?: (ms: number) => Promise<void>;
}

/**
 * Strip any credentials (and query) from a URL before logging. Defence-in-depth: with creds now
 * carried in the Basic-auth header the topic URLs are already credential-free, but if a creds-in-URL
 * is ever passed, this guarantees the failure log still never emits a secret (FDQ-43).
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '<url>';
  }
}

async function postWithRetry(
  url: string,
  headers: Record<string, string>,
  body: string,
  deps: AlertDeps,
): Promise<boolean> {
  const post = deps.post ?? defaultPost;
  const delay = deps.delay ?? ((ms: number) => sleep(ms));
  const authHeader = `Basic ${Buffer.from(`${deps.user}:${deps.pass}`).toString('base64')}`;
  const authedHeaders = { ...headers, Authorization: authHeader };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { statusCode } = await post(url, { method: 'POST', headers: authedHeaders, body });
      if (statusCode >= 200 && statusCode < 300) return true;
    } catch {
      // fall through to backoff
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await delay(BACKOFF_MS[attempt] ?? 4000);
    }
  }
  // Do NOT throw into the sweep loop — log locally (redacted URL, never creds) and continue.
  process.stderr.write(`grey-sweeper: ntfy alert failed after ${MAX_ATTEMPTS} attempts: ${redactUrl(url)}\n`);
  return false;
}

/** Operational alert (priority 3). Never throws. */
export async function alertOperational(msg: string, deps: AlertDeps): Promise<boolean> {
  return postWithRetry(
    deps.opsUrl,
    { 'Content-Type': 'text/plain', Priority: '3', Title: 'grey-sweeper' },
    msg,
    deps,
  );
}

/** Critical alert (priority 5, rotating_light). Never throws. */
export async function alertCritical(
  reason: string,
  ctx: Record<string, unknown>,
  deps: AlertDeps,
): Promise<boolean> {
  const body = `${reason}\n${JSON.stringify(ctx)}`;
  return postWithRetry(
    deps.critUrl,
    {
      'Content-Type': 'text/plain',
      Priority: '5',
      Tags: 'rotating_light',
      Title: 'grey-sweeper CRITICAL',
    },
    body,
    deps,
  );
}
