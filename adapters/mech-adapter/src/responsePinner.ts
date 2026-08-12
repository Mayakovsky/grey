// Real response pinning for the Mech task-intake loop (BION-DIRECTIVE-45/47) — the gap D-43's own
// requestContent.ts deliberately left open (see `deriveResponseHash`'s doc comment there): a real
// delivery needs its response content ACTUALLY resolvable on IPFS at the hash being delivered
// on-chain, not just a computed prediction of what that hash would be.
//
// ── Design: pin the exact bytes at Grey's own computed CID, via a real CAR import, not a flat
// upload Filebase would (re)compute its own CID for ─────────────────────────────────────────────
// BION-DIRECTIVE-45's first version PUT the flat response bytes and treated Filebase's own
// self-reported CID (`x-amz-meta-cid`) as diagnostic-only, verifying independently instead —
// reasonable caution, but BION-DIRECTIVE-46-ADDENDUM found it wasn't just caution: against
// Grey's real live Filebase account, a flat upload's Filebase-computed CID was a COMPLETELY
// different digest than `deriveResponseHash`'s own computation for the identical content. No
// amount of retrying or waiting fixes that — the content was never addressable at Grey's intended
// hash at all.
//
// BION-DIRECTIVE-47's fix: don't ask Filebase to compute a CID at all. `deriveResponseCar`
// (requestContent.ts) serializes the EXACT same DAG `deriveResponseHash` derives its hash from
// into a real CAR (Content-Addressable aRchive) file, root-anchored at that same CID. Filebase's
// S3 API supports importing a CAR verbatim via the `import=car` object-metadata flag (confirmed
// against Filebase's own docs, BION-DIRECTIVE-47 Task 1) — Filebase pins the DAG as given rather
// than recomputing one from flat bytes. The trust model is unchanged from the original design:
// Grey's own computation stays the sole authoritative hash. What's new is a fast-fail check right
// after upload — decode Filebase's own reported CID and assert it matches Grey's computed digest
// BEFORE spending the independent-gateway retry budget on a pin that's already known to be
// unreachable at the intended hash (exactly the failure mode BION-DIRECTIVE-46-ADDENDUM hit and
// had to diagnose the hard way). This check is a fast, loud failure on a real mismatch — it does
// NOT replace the independent-gateway verification below, which remains the actual correctness
// gate (a CID match doesn't yet prove the content is resolvable on the wider public network).
//
// The real correctness gate is still: after pinning, fetch the content back from a gateway
// independent of Filebase's own, AT `deriveResponseHash`'s own computed hash, and confirm it's
// byte-identical. If the real public IPFS network doesn't resolve our own computed hash to the
// right bytes, nothing is returned to the caller — same "verify before trusting" discipline as
// D-38-ADDENDUM's cross-gateway check for the static metadata pin, just automated instead of a
// one-time manual step.
//
// ── Auth: aws4fetch, not @aws-sdk/client-s3 ─────────────────────────────────────────────────────
// Filebase's S3 API needs real AWS SigV4 request signing — genuinely complex to hand-roll correctly
// (a real correctness/security risk to get subtly wrong), so this doesn't reimplement it. But the
// full @aws-sdk/client-s3 package is a very heavy dependency (large transitive tree) for what's
// really just two signed HTTP calls (PUT, HEAD). `aws4fetch` (real, published, ~5KB, zero deps —
// github.com/mhart/aws4fetch) does exactly SigV4 signing over the native fetch API and nothing
// more — a much closer fit to this codebase's existing direct-fetch style (requestContent.ts
// already calls the IPFS gateway via plain fetch) than pulling in the full AWS SDK. Confirmed
// (BION-DIRECTIVE-47 Task 1) that CAR import uses the SAME S3 SigV4 credential — no new credential
// type needed, unlike Filebase's separate (and, for this use case, unusable — see file header
// above) bearer-token IPFS Pinning Service API.
import { AwsClient } from 'aws4fetch';
import { CID } from 'multiformats/cid';
import { base16 } from 'multiformats/bases/base16';
import { base32 } from 'multiformats/bases/base32';
import { base58btc } from 'multiformats/bases/base58';
import { base64 } from 'multiformats/bases/base64';
import type { Hex } from 'viem';
import { deriveResponseCar, deriveResponseHash, hashToIpfsCid } from './requestContent.js';
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

/** BION-DIRECTIVE-47 — thrown the moment Filebase's own reported CID (post CAR-import) doesn't
 *  match Grey's computed digest. A real, previously-hit failure mode (BION-DIRECTIVE-46-ADDENDUM)
 *  — fails fast and loud here instead of burning the independent-gateway retry budget on a pin
 *  that's already provably unreachable at the intended hash. */
export class ResponsePinCidMismatchError extends Error {
  constructor(
    public readonly expectedCid: string,
    public readonly vendorCid: string,
  ) {
    super(`responsePinner: Filebase-reported CID (${vendorCid}) does not match Grey's computed CID (${expectedCid}) after CAR import — the pin is not addressable at the intended hash`);
    this.name = 'ResponsePinCidMismatchError';
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

/** Deterministic per-content S3 key for the CAR object. Keying by the content's own digest
 *  (rather than e.g. a request id) makes re-pinning identical content across retries/restarts an
 *  idempotent no-op overwrite of the same bytes. Flat, not nested under a `metadata.json` leaf —
 *  unlike the pre-D-47 flat-upload design, the S3 key here is just an opaque storage location; the
 *  real IPFS addressing comes entirely from the CAR's own encoded root CID (`import=car`), not
 *  from the key shape. */
function keyFor(digestHex: string): string {
  return `responses/${digestHex}.car`;
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
      const { hashBytes32, carBytes } = await deriveResponseCar(content);
      const cid = hashToIpfsCid(hashBytes32);
      const digestHex = hashBytes32.slice(2);
      const bytes = new TextEncoder().encode(content);
      const objectUrl = `${endpoint}/${bucket}/${keyFor(digestHex)}`;

      // BION-DIRECTIVE-47: import=car — Filebase imports the CAR's own DAG verbatim and pins its
      // real root CID, rather than computing a new CID from flat bytes (see file header for why
      // that distinction is load-bearing, not cosmetic).
      const putResponse = await aws.fetch(objectUrl, {
        method: 'PUT',
        body: carBytes,
        headers: { 'content-type': 'application/vnd.ipld.car', 'x-amz-meta-import': 'car' },
      });
      if (!putResponse.ok) {
        throw new Error(
          `responsePinner: Filebase CAR-import PUT failed for ${objectUrl}: HTTP ${putResponse.status} ${await safeText(putResponse)}`,
        );
      }

      const vendorCid = await tryReadVendorCid(objectUrl);
      if (vendorCid && !vendorCidMatches(vendorCid, hashBytes32)) {
        throw new ResponsePinCidMismatchError(cid, vendorCid);
      }

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

/** `CID.parse()`'s bare default only recognizes base32/base36/base58btc (confirmed directly — it
 *  throws "must be provided" for anything else, not assumed from docs); real Filebase responses
 *  observed live use base58btc (`Qm...`, BION-DIRECTIVE-46-ADDENDUM's own diagnostic), which that
 *  default already covers, but nothing guarantees Filebase never returns a different encoding —
 *  combining every common base decoder here means this check is robust to whichever one shows up,
 *  not just the one already observed once. */
const CID_MULTIBASE_DECODER = base16.decoder.or(base32.decoder).or(base58btc.decoder).or(base64.decoder);

/** Decodes Filebase's self-reported CID (any real CID encoding — see `CID_MULTIBASE_DECODER`)
 *  and compares its embedded multihash digest against Grey's own computed `hashBytes32` — the
 *  real, structural check BION-DIRECTIVE-46-ADDENDUM's incident showed was missing. Returns
 *  `false` (not a throw) on a malformed/unparseable vendor CID — that's a Filebase-side oddity
 *  worth surfacing via the mismatch error's own message (vendorCid is passed through as-is), not
 *  a separate crash mode. */
function vendorCidMatches(vendorCid: string, hashBytes32: Hex): boolean {
  let parsed: CID;
  try {
    parsed = CID.parse(vendorCid, CID_MULTIBASE_DECODER);
  } catch {
    return false;
  }
  const vendorDigestHex = Buffer.from(parsed.multihash.digest).toString('hex');
  return `0x${vendorDigestHex}` === hashBytes32.toLowerCase();
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
