// Real response pinning for the Mech task-intake loop (BION-DIRECTIVE-45) — the gap D-43's own
// requestContent.ts deliberately left open (see `deriveResponseHash`'s doc comment there): a real
// delivery needs its response content ACTUALLY resolvable on IPFS at the hash being delivered
// on-chain, not just a computed prediction of what that hash would be.
//
// ── Design: don't trust any vendor's own CID computation — verify against the real public network
// instead ────────────────────────────────────────────────────────────────────────────────────────
// Filebase's S3-compatible PutObject API reports the CID it computed for an uploaded object via
// the real `x-amz-meta-cid` response/HeadObject header (confirmed via Filebase's own docs +
// corroborating real usage examples — see filebaseCredentials.ts's header). Whether THAT CID is
// guaranteed to exactly equal requestContent.ts's own `deriveResponseHash` computation (CIDv0,
// non-raw-leaves, UnixFS-directory-wrapped, matching the real observed on-chain convention) depends
// on Filebase-internal defaults this codebase cannot verify without a live account — which this
// directive explicitly forbids provisioning. Rather than gambling on that assumption, this module
// treats `deriveResponseHash`'s own output as the SOLE authoritative hash (it's already proven
// correct against real on-chain examples, D-43) and Filebase's self-reported CID as a diagnostic
// only, logged for operator visibility, never trusted as the delivery hash.
//
// The real correctness gate is: after pinning, fetch the content back from a gateway independent
// of Filebase's own, AT `deriveResponseHash`'s own computed hash, and confirm it's byte-identical.
// If the real public IPFS network doesn't resolve our own computed hash to the right bytes, nothing
// is returned to the caller — same "verify before trusting" discipline as D-38-ADDENDUM's
// cross-gateway check for the static metadata pin, just automated instead of a one-time manual step.
//
// ── Auth: aws4fetch, not @aws-sdk/client-s3 ─────────────────────────────────────────────────────
// Filebase's S3 API needs real AWS SigV4 request signing — genuinely complex to hand-roll correctly
// (a real correctness/security risk to get subtly wrong), so this doesn't reimplement it. But the
// full @aws-sdk/client-s3 package is a very heavy dependency (large transitive tree) for what's
// really just two signed HTTP calls (PUT, HEAD). `aws4fetch` (real, published, ~5KB, zero deps —
// github.com/mhart/aws4fetch) does exactly SigV4 signing over the native fetch API and nothing
// more — a much closer fit to this codebase's existing direct-fetch style (requestContent.ts
// already calls the IPFS gateway via plain fetch) than pulling in the full AWS SDK.
import { AwsClient } from 'aws4fetch';
import type { Hex } from 'viem';
import { deriveResponseHash, hashToIpfsCid } from './requestContent.js';
import type { FilebaseCredentials } from './filebaseCredentials.js';

export interface PinAndVerifyResult {
  /** The base16 CIDv1 gateway-path form of the content's hash (same convention
   *  `hashToIpfsCid`/requestContent.ts already use) — requestContent.ts's own `deriveResponseHash`
   *  computation is the sole authoritative source (see file header). */
  cid: string;
  /** The bytes32 form of `cid`, ready to pass to `deliverSigned`. */
  hashBytes32: Hex;
  /** Filebase's own self-reported CID for the uploaded object (`x-amz-meta-cid`) — diagnostic
   *  only, logged for operator visibility into any drift, never trusted as the delivery hash.
   *  Undefined if the header was absent or the HeadObject lookup itself failed (non-fatal — see
   *  `pinAndVerify`, which never lets a diagnostic-only lookup block a real, verified pin). */
  vendorCid?: string;
}

export class ResponsePinVerificationError extends Error {
  constructor(
    public readonly cid: string,
    public readonly attempts: number,
    reason: string,
  ) {
    super(`responsePinner: could not verify pin for cid ${cid} after ${attempts} attempt(s): ${reason}`);
    this.name = 'ResponsePinVerificationError';
  }
}

export interface ResponsePinner {
  /** Pins `content` (the exact JSON string a response hash is derived from — same contract as
   *  requestContent.ts's own `deriveResponseHash`) and does not return until the pin is confirmed
   *  independently resolvable. Throws `ResponsePinVerificationError` if it never resolves within
   *  the configured retry budget — callers MUST NOT deliver on a thrown result. */
  pinAndVerify(content: string): Promise<PinAndVerifyResult>;
}

export interface PinVerifyPollOptions {
  maxAttempts: number;
  delayMs: number;
}

/** Real IPFS propagation after a fresh pin is not instant. This default (5 attempts, 3s apart,
 *  ~15s worst case) is a reasoned starting point, not asserted as definitively correct — the
 *  runbook (Task 3) calls out re-tuning this against real observed pin latency before go-live as
 *  a real precondition, same "bounded wait for a known real-world lag" posture BION-DIRECTIVE-32
 *  established for `serviceVisibilityPoll` (config.ts's RPC read-after-write gap), not a blind
 *  retry-and-hope. Overridable via `MechAdapterOptions` the same way `serviceVisibilityPoll` is. */
export const DEFAULT_PIN_VERIFY_POLL: PinVerifyPollOptions = { maxAttempts: 5, delayMs: 3000 };

export interface CreateFilebasePinnerOptions {
  credentials: FilebaseCredentials;
  /** Defaults to Filebase's real documented S3-compatible endpoint. Overridable for tests only. */
  endpoint?: string;
  /** Independent-of-Filebase public gateway used for the real verification fetch — deliberately
   *  NOT filebase.com's own gateway (same "independent gateway" discipline D-38-ADDENDUM used,
   *  which checked its pin via a public `dweb.link` gateway rather than Filebase's own). Defaults
   *  to the same `gateway.autonolas.tech` this adapter already trusts for request-content fetches
   *  (requestContent.ts) — one fewer new external dependency to reason about, and it's already
   *  proven reachable/working in this codebase's own real testing. Overridable via env (see
   *  main.ts) for ops flexibility — a gateway outage shouldn't require a code change to route
   *  around. */
  gatewayBaseUrl?: string;
  /** Injectable only so unit tests can stub the gateway-verify leg narrowly (same pattern D-43's
   *  taskIntake.anvil.test.ts uses for its own gateway stub) — production always uses the real
   *  global `fetch`. */
  fetchImpl?: typeof fetch;
  verifyPoll?: PinVerifyPollOptions;
}

const DEFAULT_FILEBASE_ENDPOINT = 'https://s3.filebase.com';
const DEFAULT_VERIFY_GATEWAY = 'https://gateway.autonolas.tech';
const RESPONSE_FILENAME = 'metadata.json';

/** Deterministic per-content S3 key. Keying by the content's own digest (rather than e.g. a
 *  request id) makes re-pinning identical content across retries/restarts an idempotent no-op
 *  overwrite of the same bytes, and namespaces every object under a literal `metadata.json` leaf
 *  name so Filebase's own folder/UnixFS handling wraps it consistently — matching the on-chain
 *  convention `requestContent.ts`'s `deriveResponseHash` header documents (directory-wrapped,
 *  single file named exactly `metadata.json`). */
function keyFor(digestHex: string): string {
  return `responses/${digestHex}/${RESPONSE_FILENAME}`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unreadable body>';
  }
}

export function createFilebasePinner(opts: CreateFilebasePinnerOptions): ResponsePinner {
  const endpoint = (opts.endpoint ?? DEFAULT_FILEBASE_ENDPOINT).replace(/\/$/, '');
  const gatewayBaseUrl = (opts.gatewayBaseUrl ?? DEFAULT_VERIFY_GATEWAY).replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const poll = opts.verifyPoll ?? DEFAULT_PIN_VERIFY_POLL;
  const aws = new AwsClient({
    accessKeyId: opts.credentials.accessKeyId,
    secretAccessKey: opts.credentials.secretAccessKey,
    service: 's3',
    region: 'us-east-1',
  });
  const bucket = opts.credentials.bucket;

  async function tryReadVendorCid(objectUrl: string): Promise<string | undefined> {
    try {
      const res = await aws.fetch(objectUrl, { method: 'HEAD' });
      if (!res.ok) return undefined;
      return res.headers.get('x-amz-meta-cid') ?? undefined;
    } catch {
      // Diagnostic-only — a HEAD failure never blocks a pin that otherwise verifies correctly.
      return undefined;
    }
  }

  async function verifyResolvable(cid: string, expected: Uint8Array): Promise<boolean> {
    const gatewayUrl = `${gatewayBaseUrl}/ipfs/${cid}/${RESPONSE_FILENAME}`;
    for (let attempt = 1; attempt <= poll.maxAttempts; attempt++) {
      try {
        const res = await doFetch(gatewayUrl);
        if (res.ok) {
          const actual = new Uint8Array(await res.arrayBuffer());
          if (bytesEqual(actual, expected)) return true;
        }
      } catch {
        // Transient fetch failure — fall through to retry like a non-OK response.
      }
      if (attempt < poll.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, poll.delayMs));
      }
    }
    return false;
  }

  return {
    async pinAndVerify(content: string): Promise<PinAndVerifyResult> {
      const hashBytes32 = await deriveResponseHash(content);
      const cid = hashToIpfsCid(hashBytes32);
      const digestHex = hashBytes32.slice(2);
      const bytes = new TextEncoder().encode(content);
      const objectUrl = `${endpoint}/${bucket}/${keyFor(digestHex)}`;

      const putResponse = await aws.fetch(objectUrl, {
        method: 'PUT',
        body: bytes,
        headers: { 'content-type': 'application/json' },
      });
      if (!putResponse.ok) {
        throw new Error(
          `responsePinner: Filebase PUT failed for ${objectUrl}: HTTP ${putResponse.status} ${await safeText(putResponse)}`,
        );
      }

      const vendorCid = await tryReadVendorCid(objectUrl);

      const verified = await verifyResolvable(cid, bytes);
      if (!verified) {
        throw new ResponsePinVerificationError(
          cid,
          poll.maxAttempts,
          'content at this cid did not resolve byte-identical via the independent gateway within the retry budget',
        );
      }

      return { cid, hashBytes32, vendorCid };
    },
  };
}

/** In-memory `ResponsePinner` for tests — no network calls at all. Uses the exact same real
 *  `deriveResponseHash` computation a live pinner does (so the returned hash is real, not faked),
 *  "pins" into a plain Map, and reports it verified unconditionally — proving the CALLING code's
 *  wiring (routeRequest/pollAndRespond correctly await the pin before trusting a hash, correctly
 *  propagate a thrown pin failure into routingErrors) without needing a real Filebase account or
 *  real IPFS gateway. `createFilebasePinner`'s own real pin/verify/retry logic is separately
 *  covered end-to-end by test/responsePinner.test.ts against a stubbed `fetch` (both the Filebase
 *  PUT/HEAD leg and the gateway-verify leg) — this stub exists purely for wiring tests
 *  (test/taskIntake.anvil.test.ts), same "narrowly scoped, only what THIS test needs" posture
 *  D-43's own stub used. */
export function createStubResponsePinner(store: Map<string, string> = new Map()): ResponsePinner & { store: Map<string, string> } {
  return {
    store,
    async pinAndVerify(content: string): Promise<PinAndVerifyResult> {
      const hashBytes32 = await deriveResponseHash(content);
      const cid = hashToIpfsCid(hashBytes32);
      store.set(cid, content);
      return { cid, hashBytes32 };
    },
  };
}
