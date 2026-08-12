// Real request/response content encoding for the Mech Marketplace (BION-DIRECTIVE-43) — traced
// from real, already-delivered requests on Base mainnet, not guessed. `MarketplaceRequest`'s
// `requestDatas[i]` (and `Deliver`'s `data`, symmetrically) are NOT free text or raw JSON bytes —
// each is a raw bytes32 IPFS content-hash digest, the exact same CID-derivation convention already
// reverse-engineered in config.ts for GREY_MECH_CONFIG_HASH/GREY_MECH_PAYLOAD_HASH, just applied
// per-request instead of per-mech-metadata.
//
// Confirmed two ways, not assumed from one source:
//  1. The real Base marketplace subgraph (api.subgraph.autonolas.tech/api/proxy/marketplace-base)
//     exposes a `ParsedRequest` entity with a `hash` field in exactly the `f01701220<64-hex-digest>`
//     shape config.ts's own doc comments already describe.
//  2. Independently decoded the RAW on-chain event for the same real request (tx
//     `0x201fd7f3eef9c1d02c85d3a2122facaac8dc26469c997e676d982b90d9a9508e`) — required fixing a real
//     bug found along the way: marketplaceAbi.ts's `MarketplaceRequest` declared `priorityMech`/
//     `requester` as non-indexed, but the real event has both indexed (same class of bug D-36 found
//     and fixed for `CreateMech` — see that file's own fix comment). The raw `requestDatas[0]` bytes
//     matched the subgraph's `hash` field exactly, minus the `f01701220` multicodec/multibase
//     prefix. Then independently fetched the real IPFS content at that exact hash via
//     gateway.autonolas.tech (not just trusting the subgraph's own parsed `content` field) —
//     byte-identical.
//
// Real content schema, observed directly (not assumed): `{prompt, tool, nonce, schema_version,
// request_context}` — `tool` is how a multi-tool mech (confirmed real, live: one real mech,
// 0xe535d7ac..., served 5 distinct tools — google_image_gen, stabilityai-stable-diffusion-v1-6,
// short_maker, openai-gpt-4o-2024-08-06, claude-prediction-online — through ONE marketplace
// registration) knows which registered tool a request is asking for. Grey's own snake_case
// offering slugs match this convention exactly (`google_image_gen`/`short_maker` are the closest
// real analogues — plain slugs, not just LLM-model-version strings).
//
// The real content is NOT a flat IPFS file — it's wrapped in a UnixFS directory containing exactly
// one file, `metadata.json` (confirmed by resolving the real gateway directory listing directly,
// not assumed). Both the decode (bytes32 → fetch) and encode (content → bytes32) directions below
// account for this — encode was empirically verified against the real Basius-request example
// above: reproducing that exact directory-wrapped CIDv0 from the real content bytes yields the
// EXACT real on-chain bytes32 digest, byte for byte.
import type { CID } from 'multiformats/cid';
import { importer } from 'ipfs-unixfs-importer';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { CarWriter } from '@ipld/car';
import type { Hash, Hex } from 'viem';

export interface RequestContent {
  prompt: string;
  tool: string;
  nonce: string;
  schema_version: string;
  request_context: unknown;
}

/** The fixed multicodec/multibase prefix config.ts's own derivation already documents —
 *  `f` (multibase: base16 lowercase) + `01` (CIDv1) + `70` (dag-pb codec) + `1220` (multihash:
 *  sha2-256, 32 bytes). Constant, not per-request. */
const IPFS_HASH_PREFIX = 'f01701220';

/** bytes32 on-chain hash → the CIDv1 (base16) string usable directly as an IPFS gateway path —
 *  literally prepending the fixed prefix, since a base16-multibase CIDv1 string IS `f` + the raw
 *  multicodec/multihash bytes as hex. No library needed for this direction; verified against two
 *  independent real examples before trusting it (see file header). */
export function hashToIpfsCid(hash: Hash | Hex): string {
  const digest = hash.startsWith('0x') ? hash.slice(2) : hash;
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) {
    throw new Error(`requestContent: expected a 32-byte hex hash, got "${hash}"`);
  }
  return `${IPFS_HASH_PREFIX}${digest.toLowerCase()}`;
}

export interface FetchRequestContentOptions {
  /** Defaults to the same gateway D-30's research already found reachable (public gateways
   *  ipfs.io/dweb.link/w3s.link/nftstorage.link all timed out or 403'd during that research). */
  gatewayBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Fetches and parses a real request's content from its on-chain bytes32 hash. Tries the CID path
 *  directly first (a flat single-file CID would resolve here); falls back to `/metadata.json`
 *  (the real, observed directory-wrapped shape — see file header) if the direct fetch isn't valid
 *  JSON. Does not perform its own trust-nothing hash re-verification against the fetched bytes —
 *  UnixFS directory-wrapped CIDs need real DAG-node reconstruction to re-verify (not just a flat
 *  sha256), which is real added scope beyond this directive's build-and-fork-prove ask; flagged
 *  here explicitly rather than silently skipped, for a future pass to decide before any live
 *  reliance on gateway-served content. */
export async function fetchRequestContent(
  hash: Hash | Hex,
  opts: FetchRequestContentOptions = {},
): Promise<RequestContent> {
  const gateway = opts.gatewayBaseUrl ?? 'https://gateway.autonolas.tech';
  const doFetch = opts.fetchImpl ?? fetch;
  const cid = hashToIpfsCid(hash);

  const direct = await doFetch(`${gateway}/ipfs/${cid}`);
  const directText = await direct.text();
  const parsed = tryParseRequestContent(directText);
  if (parsed) return parsed;

  const viaMetadata = await doFetch(`${gateway}/ipfs/${cid}/metadata.json`);
  if (!viaMetadata.ok) {
    throw new Error(`requestContent: failed to fetch content for hash ${hash} (cid ${cid}): HTTP ${viaMetadata.status}`);
  }
  const metadataText = await viaMetadata.text();
  const metadataParsed = tryParseRequestContent(metadataText);
  if (!metadataParsed) {
    throw new Error(`requestContent: content at hash ${hash} (cid ${cid}) is not a valid request document`);
  }
  return metadataParsed;
}

function tryParseRequestContent(text: string): RequestContent | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    typeof (json as Record<string, unknown>).prompt !== 'string' ||
    typeof (json as Record<string, unknown>).tool !== 'string'
  ) {
    return null;
  }
  return json as RequestContent;
}

/** Shared core of `deriveResponseHash`/`deriveResponseCar` — runs the real UnixFS import ONCE
 *  (empirically verified, see the exported functions' own doc comments) and returns everything
 *  either caller needs: the blockstore holding every real block the import produced, and the real
 *  root CID. Kept as ONE function rather than two independent implementations so there is no
 *  possibility of the hash-only path and the CAR-export path silently drifting apart (same
 *  "ground truth by construction, not a parallel implementation" discipline used elsewhere in this
 *  package). */
async function importResponseDag(content: string): Promise<{ blockstore: MemoryBlockstore; rootCid: CID }> {
  const blockstore = new MemoryBlockstore();
  const bytes = new TextEncoder().encode(content);
  let rootCid: CID | undefined;
  for await (const entry of importer(
    [{ path: 'metadata.json', content: bytes }],
    blockstore,
    { wrapWithDirectory: true, cidVersion: 0, rawLeaves: false },
  )) {
    if (entry.path === '') rootCid = entry.cid;
  }
  if (!rootCid) {
    throw new Error('requestContent: directory-wrapped import produced no root CID');
  }
  return { blockstore, rootCid };
}

/** `Blockstore#get()`/`getAll()` return chunked `Generator<Uint8Array> | AsyncGenerator<Uint8Array>`
 *  values (interface-blockstore's real, documented shape — not a plain `Promise<Uint8Array>`),
 *  since a real backing store may stream large blocks; `CarWriter`'s own `out` is likewise an
 *  `AsyncIterable<Uint8Array>` of encoded CAR chunks. Same concatenation need either way — every
 *  block/CAR this package produces is small (response payloads, not media), so buffering fully in
 *  memory is the right tradeoff over adding streaming complexity nothing here needs yet. */
async function drainToBytes(chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const collected: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    collected.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of collected) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function hashBytes32FromCid(cid: CID): Hex {
  // CIDv0 is base58btc(0x12 0x20 <32-byte sha256 digest>) — decode via the CID class's own
  // multihash rather than hand-rolled base58 (this library already parsed it correctly; no
  // point re-deriving what it already computed).
  return `0x${Buffer.from(cid.multihash.digest).toString('hex')}` as Hex;
}

/** Derives the bytes32 hash Grey's own response content WOULD get once pinned to IPFS —
 *  empirically verified (file header) to reproduce the real on-chain convention exactly:
 *  directory-wrapped (`metadata.json`), CIDv0, non-raw-leaves (the legacy `ipfs add` defaults the
 *  real observed requests/deliveries were created under, not the newer library defaults, which
 *  differ — verified directly, not assumed).
 *
 *  Deliberately does NOT pin anything to a real IPFS/Filebase service on its own — that's
 *  `deriveResponseCar` + `responsePinner.ts`'s job (BION-DIRECTIVE-45/47). This function only
 *  computes what the hash would be; used directly by tests/fixtures that need the real hash
 *  without needing an exportable CAR alongside it. */
export async function deriveResponseHash(content: string): Promise<Hex> {
  const { rootCid } = await importResponseDag(content);
  return hashBytes32FromCid(rootCid);
}

/** BION-DIRECTIVE-47 — the same real import as `deriveResponseHash`, but also serializes every
 *  real block it produced into an actual CAR (Content-Addressable aRchive) file, root-anchored at
 *  the same CID the hash is derived from. Exists because pinning content via a flat single-object
 *  upload lets the pinning provider compute (and potentially disagree with) its own CID for it —
 *  confirmed a REAL problem, not a hypothetical one, against Grey's live Filebase account
 *  (BION-DIRECTIVE-46-ADDENDUM): Filebase's own computed CID for a flat upload was a completely
 *  different digest than this exact function's own `deriveResponseHash` computation. A CAR file
 *  is the standard IPFS mechanism for handing a pinning provider the EXACT DAG (blocks + root) to
 *  pin verbatim, rather than asking it to (re)compute one — confirmed real and supported by
 *  Filebase specifically via its S3 API's `import=car` object-metadata flag (its own docs;
 *  responsePinner.ts cites the exact mechanism). `writer.put()`'s `Promise` does not resolve
 *  until `out` is drained (documented backpressure in `@ipld/car`, not assumed) — this drains
 *  `out` concurrently with the writes (an unawaited async IIFE started first), not sequentially
 *  after, to avoid a real deadlock risk for anything beyond a trivially small CAR. */
export async function deriveResponseCar(content: string): Promise<{ hashBytes32: Hex; carBytes: Uint8Array }> {
  const { blockstore, rootCid } = await importResponseDag(content);

  const { writer, out } = await CarWriter.create([rootCid]);
  const outChunks: Uint8Array[] = [];
  const drained = (async () => {
    for await (const chunk of out) outChunks.push(chunk);
  })();
  for await (const pair of blockstore.getAll()) {
    const bytes = await drainToBytes(pair.bytes);
    await writer.put({ cid: pair.cid, bytes });
  }
  await writer.close();
  await drained;

  return { hashBytes32: hashBytes32FromCid(rootCid), carBytes: await drainToBytes(outChunks) };
}
