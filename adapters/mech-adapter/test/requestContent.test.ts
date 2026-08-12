// BION-DIRECTIVE-43 — real, verbatim data throughout (mirrors decodeCreateMechAddress's test
// style): a real, already-delivered Base marketplace request (tx
// 0x201fd7f3eef9c1d02c85d3a2122facaac8dc26469c997e676d982b90d9a9508e), its real requestDatas[0]
// bytes32 hash, and the real IPFS content at that hash — fetched and recorded during this
// directive's Task 1 research, not synthesized. The network-touching fetch itself is exercised
// against a fake fetch implementation here (no live network in `vitest run`); real network fetch
// is exercised in the anvil fork test.
import { describe, it, expect } from 'vitest';
import { CarReader } from '@ipld/car';
import { sha256 } from 'multiformats/hashes/sha2';
import { hashToIpfsCid, fetchRequestContent, deriveResponseHash, deriveResponseCar } from '../src/requestContent.js';

const REAL_HASH = '0xc05263b67b6b7814afd7648e311c765b85cec6674d93f2cdc9a75616c0c4a0d8' as const;
const REAL_CID = 'f01701220c05263b67b6b7814afd7648e311c765b85cec6674d93f2cdc9a75616c0c4a0d8';
// Byte-exact real content (CRLF line endings included — this is what was actually pinned; the
// derived hash below is sensitive to this exact byte sequence, not a re-formatted equivalent).
const REAL_CONTENT_BYTES =
  '{\r\n    "prompt": "Basius staking activity request.",\r\n    "tool": "openai-gpt-4o-2024-08-06",\r\n    "nonce": "f9811dd7-8fad-47f2-8a5f-de46b1a0920b",\r\n    "schema_version": "2.0",\r\n    "request_context": null\r\n}';

describe('hashToIpfsCid (BION-DIRECTIVE-43)', () => {
  it('derives the exact real CID string from a real on-chain hash', () => {
    expect(hashToIpfsCid(REAL_HASH)).toBe(REAL_CID);
  });

  it('accepts a hash without 0x prefix too', () => {
    expect(hashToIpfsCid(REAL_HASH.slice(2) as `0x${string}`)).toBe(REAL_CID);
  });

  it('rejects a malformed hash rather than silently deriving a bad CID', () => {
    expect(() => hashToIpfsCid('0xdeadbeef')).toThrow(/32-byte hex hash/);
  });
});

describe('fetchRequestContent (BION-DIRECTIVE-43)', () => {
  it('parses real content when the direct CID path returns it (flat, non-directory-wrapped case)', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe(`https://gateway.autonolas.tech/ipfs/${REAL_CID}`);
      return new Response(REAL_CONTENT_BYTES, { status: 200 });
    };
    const content = await fetchRequestContent(REAL_HASH, { fetchImpl: fetchImpl as typeof fetch });
    expect(content).toEqual({
      prompt: 'Basius staking activity request.',
      tool: 'openai-gpt-4o-2024-08-06',
      nonce: 'f9811dd7-8fad-47f2-8a5f-de46b1a0920b',
      schema_version: '2.0',
      request_context: null,
    });
  });

  it('falls back to /metadata.json when the direct path is a directory listing (the real observed shape)', async () => {
    let calls = 0;
    const fetchImpl = async (url: string | URL | Request) => {
      calls++;
      const urlStr = String(url);
      if (calls === 1) {
        expect(urlStr).toBe(`https://gateway.autonolas.tech/ipfs/${REAL_CID}`);
        return new Response('<!DOCTYPE html><html>directory listing</html>', { status: 200 });
      }
      expect(urlStr).toBe(`https://gateway.autonolas.tech/ipfs/${REAL_CID}/metadata.json`);
      return new Response(REAL_CONTENT_BYTES, { status: 200 });
    };
    const content = await fetchRequestContent(REAL_HASH, { fetchImpl: fetchImpl as typeof fetch });
    expect(content.tool).toBe('openai-gpt-4o-2024-08-06');
    expect(calls).toBe(2);
  });

  it('throws a clear error when neither path yields valid request content', async () => {
    const fetchImpl = async () => new Response('not found', { status: 404 });
    await expect(fetchRequestContent(REAL_HASH, { fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      /failed to fetch content/,
    );
  });
});

describe('deriveResponseHash (BION-DIRECTIVE-43)', () => {
  it('reproduces the exact real on-chain hash from the exact real content bytes', async () => {
    const hash = await deriveResponseHash(REAL_CONTENT_BYTES);
    expect(hash).toBe(REAL_HASH);
  });

  it('produces a different hash for different content (sanity — not a constant)', async () => {
    const hash = await deriveResponseHash('{"prompt":"something else"}');
    expect(hash).not.toBe(REAL_HASH);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('deriveResponseCar (BION-DIRECTIVE-47)', () => {
  it('produces the same hash deriveResponseHash does for the exact real content bytes', async () => {
    const { hashBytes32 } = await deriveResponseCar(REAL_CONTENT_BYTES);
    expect(hashBytes32).toBe(REAL_HASH);
  });

  it('produces a real, valid CAR file — parseable, root-anchored at the computed hash, every block content-addressed correctly', async () => {
    const { hashBytes32, carBytes } = await deriveResponseCar(REAL_CONTENT_BYTES);

    // A real CAR reader, not a hand-parsed byte check — proves this is an actual valid CAR
    // container, not just some bytes we happen to also call "carBytes".
    const reader = await CarReader.fromBytes(carBytes);

    const roots = await reader.getRoots();
    expect(roots).toHaveLength(1);
    // The CAR's own root CID digest matches deriveResponseCar's returned hash — the actual
    // load-bearing property (this is what Filebase pins as x-amz-meta-cid).
    expect(Buffer.from(roots[0].multihash.digest).toString('hex')).toBe(hashBytes32.slice(2));

    // Content-address integrity: for EVERY block the CAR carries, re-hash its raw bytes with the
    // real sha2-256 hasher and confirm it equals the block's own claimed CID digest — proves the
    // CAR doesn't just have the right root pointer, every block inside is genuinely what it says
    // it is (exactly the property a pinning provider needs to trust when importing it verbatim).
    let blockCount = 0;
    for await (const { cid, bytes } of reader.blocks()) {
      blockCount++;
      const recomputed = await sha256.digest(bytes);
      expect(Buffer.from(recomputed.digest).toString('hex')).toBe(Buffer.from(cid.multihash.digest).toString('hex'));
    }
    // Exactly two blocks for this content: the file's leaf block + the wrapping directory block
    // (same real shape requestContent.ts's own header documents for deriveResponseHash).
    expect(blockCount).toBe(2);
  });

  it('round-trips different content to different CAR roots (sanity — not a constant)', async () => {
    const a = await deriveResponseCar(REAL_CONTENT_BYTES);
    const b = await deriveResponseCar('{"prompt":"something else"}');
    expect(a.hashBytes32).not.toBe(b.hashBytes32);
    expect(a.carBytes).not.toEqual(b.carBytes);
  });
});
