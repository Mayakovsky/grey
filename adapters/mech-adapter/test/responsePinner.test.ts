// BION-DIRECTIVE-45/47 — real end-to-end coverage of createFilebasePinner's pin/verify/retry logic
// against a stubbed `globalThis.fetch` (no real Filebase account, no real IPFS gateway) — the
// "stub/local pinning target" the directive itself asks for. aws4fetch's AwsClient.fetch() calls
// the unqualified global `fetch` at call time (confirmed directly against its real source,
// github.com/mhart/aws4fetch — not assumed), so a single narrowly-scoped `globalThis.fetch` stub
// intercepts both legs this module makes: the signed Filebase PUT/HEAD calls AND the independent-
// gateway verify GET. Everything else (SigV4 signing, the real deriveResponseCar computation, the
// retry/backoff loop, the byte-identical comparison) runs for real, unmocked.
import { describe, it, expect } from 'vitest';
import { createFilebasePinner, ResponsePinCidMismatchError, ResponsePinVerificationError } from '../src/responsePinner.js';
import { deriveResponseHash, hashToIpfsCid } from '../src/requestContent.js';

const FAKE_ENDPOINT = 'https://fake-filebase.test';
const FAKE_GATEWAY = 'https://fake-gateway.test';
const BUCKET = 'grey-olas-responses-test';

/** In-memory "Filebase" — keyed by the exact object URL createFilebasePinner PUTs/HEADs. Records
 *  every PUT's real request headers too, so tests can assert `x-amz-meta-import: car` was actually
 *  sent (BION-DIRECTIVE-47) — not just that SOME body landed. */
function fakeFilebase(opts: { vendorCid?: string } = {}) {
  const store = new Map<string, Uint8Array>();
  const putHeaders: Headers[] = [];
  return {
    store,
    putHeaders,
    async handle(url: string, init?: RequestInit): Promise<Response> {
      const method = init?.method ?? 'GET';
      if (method === 'PUT') {
        const body = init!.body as Uint8Array | ArrayBuffer | string;
        const bytes =
          body instanceof Uint8Array ? body : typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer);
        store.set(url, bytes);
        putHeaders.push(new Headers(init?.headers));
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
      // aws4fetch signs by returning a Request when passed one — normalize to (url, init) either
      // way. Headers matter here too (BION-DIRECTIVE-47's x-amz-meta-import: car assertion), not
      // just method/body.
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
      const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
      const body = input instanceof Request ? undefined : init?.body;
      return filebase.handle(url, {
        method,
        headers,
        body: body ?? (input instanceof Request ? await input.clone().arrayBuffer() : undefined),
      });
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

describe('createFilebasePinner (BION-DIRECTIVE-45/47)', () => {
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
      // BION-DIRECTIVE-47: pinning is via CAR import, not a flat upload — assert the real
      // request actually carried the metadata flag Filebase's docs say triggers it, not just
      // that the fake accepted whatever bytes it received.
      expect(filebase.putHeaders).toHaveLength(1);
      expect(filebase.putHeaders[0].get('x-amz-meta-import')).toBe('car');
    } finally {
      restore();
    }
  });

  it('BION-DIRECTIVE-47: matches a real base58btc-encoded vendor CID (the shape Filebase actually returned live, per BION-DIRECTIVE-46-ADDENDUM), not just a coincidentally-matching base16 one', async () => {
    // A real CIDv0 (base58btc "Qm...") for arbitrary content, independent of this test's own
    // CONTENT/hash — the point is proving the multibase decoder handles this real encoding
    // family at all, wired up to actually equal our computed digest via a controlled fixture
    // rather than hoping a random real CID happens to collide.
    const expectedHashBytes32 = await deriveResponseHash(CONTENT);
    // Re-encode the exact same digest as a real CIDv0 base58btc string, the way Filebase's real
    // HEAD response does — round-trips through the same multiformats CID class this file's
    // production code uses, not hand-encoded.
    const { CID } = await import('multiformats/cid');
    const { base16 } = await import('multiformats/bases/base16');
    const base16Cid = hashToIpfsCid(expectedHashBytes32);
    const parsed = CID.parse(base16Cid, base16.decoder);
    const vendorCidV0 = parsed.toV0().toString(); // real "Qm..." form
    expect(vendorCidV0.startsWith('Qm')).toBe(true);

    const bytes = new TextEncoder().encode(CONTENT);
    const filebase = fakeFilebase({ vendorCid: vendorCidV0 });
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
      expect(result.vendorCid).toBe(vendorCidV0);
      expect(result.hashBytes32).toBe(expectedHashBytes32);
    } finally {
      restore();
    }
  });

  it('BION-DIRECTIVE-47: throws ResponsePinCidMismatchError immediately when Filebase reports a different CID — never spends the gateway retry budget on a doomed pin', async () => {
    const bytes = new TextEncoder().encode(CONTENT);
    // A real, well-formed, but WRONG CID — deliberately different digest than CONTENT's own.
    const wrongCid = 'QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx';
    const filebase = fakeFilebase({ vendorCid: wrongCid });
    const gateway = fakeGateway({ content: bytes, readyAfterCalls: 1 });
    const restore = installStubFetch(filebase, gateway);
    try {
      const pinner = createFilebasePinner({
        credentials: CREDENTIALS,
        endpoint: FAKE_ENDPOINT,
        gatewayBaseUrl: FAKE_GATEWAY,
        verifyPoll: { maxAttempts: 5, delayMs: 1 },
      });
      await expect(pinner.pinAndVerify(CONTENT)).rejects.toThrow(ResponsePinCidMismatchError);
      // The real point of the fast-fail: it never even tried the gateway, let alone retried.
      expect(gateway.callCount).toBe(0);
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
      await expect(pinner.pinAndVerify(CONTENT)).rejects.toThrow(/Filebase CAR-import PUT failed/);
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
