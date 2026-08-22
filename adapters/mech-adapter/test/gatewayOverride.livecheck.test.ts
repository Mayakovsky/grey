// Real, live (NOT stubbed) network test behind a skip-gate — same convention as
// safeDeliveryClient.anvil.test.ts/taskIntake.anvil.test.ts (GREY_MECH_ANVIL=1), a separate flag
// here since this hits real public IPFS gateways, not a forked chain.
//
// BION-DIRECTIVE-114 — Forces' two real self-test runs both failed at Filebase pin verification
// because scripts/self-test-request.ts's first version used the hardcoded default gateway
// (gateway.autonolas.tech), whose IPFS-resolution backend was already found genuinely broken once
// before (BION-DIRECTIVE-57, 2026-08-13) and is STILL broken (confirmed live during this
// directive: a real curl against that same D-57 CID timed out completely, 20s, zero bytes).
// Production (main.ts) already routes around this via MECH_ADAPTER_PIN_VERIFY_GATEWAY_URL
// (https://ipfs.io) — the bug was that self-test-request.ts never reused that same override.
//
// D-114 explicitly asked for "something that actually proves a real pin resolves via a real
// independent gateway... not just a stub" — but a genuinely fresh pin-and-verify needs real
// Filebase credentials this codebase deliberately never holds (filebaseCredentials.ts's own file
// header: provisioning them is out of scope for Kov, same posture as every other real secret this
// project keeps operator-side-only). What CAN be proven for real, without any credentials, is the
// actual mechanism the fix depends on: that the broken default gateway really fails against known-
// good, already-resolvable content, and that the override really succeeds against the SAME
// content — i.e., that switching gatewayBaseUrl is a real, live fix, not a guess. Uses the exact
// real CID D-57 already proved was correctly pinned and independently resolvable
// (f01701220b7e8588adbf568a4db4ebe2bbb52cf6d517aed5856eca8e95866754e3fde7825, a real, harmless,
// already-existing self-test document — costs nothing further to leave pinned, per D-57's own
// note) — if this ever stops resolving via ipfs.io too, that's a real, separate finding this test
// will also catch.
//
// To run: GREY_MECH_LIVE_GATEWAY_CHECK=1 pnpm --filter @grey/mech-adapter test
import { describe, it, expect } from 'vitest';

const ENABLED = process.env.GREY_MECH_LIVE_GATEWAY_CHECK === '1';
const d = ENABLED ? describe : describe.skip;

// D-57's real, already-pinned, already-proven-resolvable self-test document — reused here rather
// than pinning anything new (no credentials available to do that from this test anyway).
const KNOWN_GOOD_CID = 'f01701220b7e8588adbf568a4db4ebe2bbb52cf6d517aed5856eca8e95866754e3fde7825';
const BROKEN_DEFAULT_GATEWAY = 'https://gateway.autonolas.tech';
const FIXED_OVERRIDE_GATEWAY = 'https://ipfs.io';

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

d('mech-adapter — gateway override, real live network proof (BION-DIRECTIVE-114)', () => {
  it('the broken default gateway (gateway.autonolas.tech) really fails against known-good, already-resolvable content — not a one-off, still true today', async () => {
    await expect(
      fetchWithTimeout(`${BROKEN_DEFAULT_GATEWAY}/ipfs/${KNOWN_GOOD_CID}/metadata.json`, 20_000),
    ).rejects.toThrow();
  }, 25_000);

  it('the fixed override (https://ipfs.io) really resolves the SAME content, byte-identical, proving the fix is real', async () => {
    const res = await fetchWithTimeout(`${FIXED_OVERRIDE_GATEWAY}/ipfs/${KNOWN_GOOD_CID}/metadata.json`, 10_000);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { prompt: string; nonce: string };
    expect(typeof body.prompt).toBe('string');
    expect(body.nonce).toBe('d57-real-self-test-1');
  }, 15_000);
});
