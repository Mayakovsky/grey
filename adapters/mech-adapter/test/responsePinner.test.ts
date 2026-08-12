// BION-DIRECTIVE-45 — real end-to-end coverage of createFilebasePinner's pin/verify/retry logic
// against a stubbed `globalThis.fetch` (no real Filebase account, no real IPFS gateway) — the
// "stub/local pinning target" the directive itself asks for. aws4fetch's AwsClient.fetch() calls
// the unqualified global `fetch` at call time (confirmed directly against its real source,
// github.com/mhart/aws4fetch — not assumed), so a single narrowly-scoped `globalThis.fetch` stub
// intercepts both legs this module makes: the signed Filebase PUT/HEAD calls AND the independent-
// gateway verify GET. Everything else (SigV4 signing, the real deriveResponseHash computation, the
// retry/backoff loop, the byte-identical comparison) runs for real, unmocked.
import { describe, it, expect } from 'vitest';
import { createFilebasePinner, ResponsePinVerificationError } from '../src/responsePinner.js';
import { deriveResponseHash, hashToIpfsCid } from '../src/requestContent.js';

const FAKE_ENDPOINT = 'https://fake-filebase.test';
const FAKE_GATEWAY = 'https://fake-gateway.test';
const BUCKET = 'grey-olas-responses-test';

/** In-memory "Filebase" — keyed by the exact object URL createFilebasePinner PUTs/HEADs. */
function fakeFilebase(opts: { vendorCid?: string } = {}) {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async handle(url: string, init?: RequestInit): Promise<Response> {
      const method = init?.method ?? 'GET';
      if (method === 'PUT') {
        const body = init!.body as Uint8Array | ArrayBuffer | string;
        const bytes =
          body instanceof Uint8Array ? body : typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer);
        store.set(url, bytes);
        return new Response(null, { status: 200 });
      }
      if (method === 'HEAD') {
        if (!store.has(url)) return new Response(null, { status: 404 });
        const headers = opts.vendorCid ? { 'x-amz-meta-cid': opts.vendorCid } : {};
        return new Response(null, { status: 200, headers });
      }
      return new Response('method not stubbed', { status: 500 });
    },
  };
}

/** In-memory "independent gateway" — resolves a cid to content this fake was told to serve, only
 *  once `readyAfterCalls` requests for that path have already happened (simulates real IPFS
 *  propagation lag), or never (simulates a pin that never becomes resolvable). */
function fakeGateway(opts: { content?: Uint8Array; readyAfterCalls?: number; neverResolves?: boolean } = {}) {
  let calls = 0;
  return {
    get callCount() {
      return calls;
    },
    async handle(): Promise<Response> {
      calls++;
      if (opts.neverResolves) return new Response(null, { status: 404 });
      const readyAfter = opts.readyAfterCalls ?? 1;
      if (calls < readyAfter || !opts.content) return new Response(null, { status: 404 });
      return new Response(opts.content, { status: 200 });
    },
  };
}

function installStubFetch(filebase: ReturnType<typeof fakeFilebase>, gateway: ReturnType<typeof fakeGateway>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(FAKE_ENDPOINT)) {
      // aws4fetch signs by returning a Request when passed one — normalize to (url, init) either way.
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
      const body = input instanceof Request ? undefined : init?.body;
      return filebase.handle(url, { method, body: body ?? (input instanceof Request ? await input.clone().arrayBuffer() : undefined) });
    }
    if (url.startsWith(FAKE_GATEWAY)) {
      return gateway.handle();
    }
    return original(input as never, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const CREDENTIALS = { accessKeyId: 'fake-access-key', secretAccessKey: 'fake-secret-key', bucket: BUCKET };
const CONTENT = JSON.stringify({ market: {}, status: 'NOT_YET_ANALYSED', analysis: null, lastAnalysed: null, note: null });

describe('createFilebasePinner (BION-DIRECTIVE-45)', () => {
  it('pins and verifies real content on the first gateway check, returns the real deriveResponseHash value', async () => {
    const expectedHashBytes32 = await deriveResponseHash(CONTENT);
    const expectedCid = hashToIpfsCid(expectedHashBytes32);
    const bytes = new TextEncoder().encode(CONTENT);

    const filebase = fakeFilebase({ vendorCid: expectedCid });
    const gateway = fakeGateway({ content: bytes, readyAfterCalls: 1 });
    const restore = installStubFetch(filebase, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 3, delayMs: 1 },
      });
      const result = await pinner.pinAndVerify(CONTENT);
      expect(result.hashBytes32).toBe(expectedHashBytes32);
      expect(result.cid).toBe(expectedCid);
      expect(result.vendorCid).toBe(expectedCid);
      expect(filebase.store.size).toBe(1);
    } finally {
      restore();
    }
  });

  it('retries through real propagation lag — resolves once the gateway catches up', async () => {
    const bytes = new TextEncoder().encode(CONTENT);
    const filebase = fakeFilebase();
    const gateway = fakeGateway({ content: bytes, readyAfterCalls: 3 }); // 404 twice, then real content
    const restore = installStubFetch(filebase, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 5, delayMs: 1 },
      });
      const result = await pinner.pinAndVerify(CONTENT);
      expect(result.hashBytes32).toBeDefined();
      expect(gateway.callCount).toBe(3);
    } finally {
      restore();
    }
  });

  it('throws ResponsePinVerificationError — never delivers on faith — when the pin never resolves', async () => {
    const filebase = fakeFilebase();
    const gateway = fakeGateway({ neverResolves: true });
    const restore = installStubFetch(filebase, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 3, delayMs: 1 },
      });
      await expect(pinner.pinAndVerify(CONTENT)).rejects.toThrow(ResponsePinVerificationError);
      expect(gateway.callCount).toBe(3); // exhausted the real retry budget, not a single-shot failure
    } finally {
      restore();
    }
  });

  it('throws when the gateway resolves to different bytes than what was pinned (corruption, not just absence)', async () => {
    const wrongBytes = new TextEncoder().encode(JSON.stringify({ not: 'the real content' }));
    const filebase = fakeFilebase();
    const gateway = fakeGateway({ content: wrongBytes, readyAfterCalls: 1 });
    const restore = installStubFetch(filebase, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 2, delayMs: 1 },
      });
      await expect(pinner.pinAndVerify(CONTENT)).rejects.toThrow(ResponsePinVerificationError);
    } finally {
      restore();
    }
  });

  it('throws immediately (no retry) when the Filebase PUT itself fails', async () => {
    const restore = installStubFetch(
      {
        store: new Map(),
        handle: async () => new Response('access denied', { status: 403 }),
      } as unknown as ReturnType<typeof fakeFilebase>,
      fakeGateway({ neverResolves: true }),
    );
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 3, delayMs: 1 },
      });
      await expect(pinner.pinAndVerify(CONTENT)).rejects.toThrow(/Filebase PUT failed/);
    } finally {
      restore();
    }
  });

  it('a HeadObject failure reading vendorCid is non-fatal — the verified pin still succeeds', async () => {
    const bytes = new TextEncoder().encode(CONTENT);
    const filebase = {
      store: new Map<string, Uint8Array>(),
      async handle(url: string, init?: RequestInit): Promise<Response> {
        const method = init?.method ?? 'GET';
        if (method === 'PUT') {
          this.store.set(url, bytes);
          return new Response(null, { status: 200 });
        }
        // HEAD deliberately errors (403, not 5xx/429 — those trigger aws4fetch's own internal
        // retry loop, which would just slow this test down without changing the outcome) —
        // vendorCid lookup should degrade gracefully, not fail the pin.
        return new Response(null, { status: 403 });
      },
    };
    const gateway = fakeGateway({ content: bytes, readyAfterCalls: 1 });
    const restore = installStubFetch(filebase as ReturnType<typeof fakeFilebase>, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 2, delayMs: 1 },
      });
      const result = await pinner.pinAndVerify(CONTENT);
      expect(result.vendorCid).toBeUndefined();
      expect(result.hashBytes32).toBeDefined();
    } finally {
      restore();
    }
  });
});
