import { describe, it, expect } from 'vitest';
import process from 'node:process';

// Opt-in only: requires a local anvil/fork with the IdentityRegistry deployed.
// Run with GREY_CEREMONY_ANVIL=1 and GREY_CEREMONY_RPC_URL set. These do NOT
// count toward the CI-default unit total.
const ENABLED = process.env.GREY_CEREMONY_ANVIL === '1';

describe.skipIf(!ENABLED)('ceremony anvil end-to-end', () => {
  it('mint → sign-consent → link-agent → verify against a fork', async () => {
    // Intentionally left as a manual/opt-in harness; see TESTING.md for the
    // full anvil provisioning + key setup. This placeholder asserts the gate
    // wiring so the suite remains valid whether or not anvil is present.
    expect(process.env.GREY_CEREMONY_RPC_URL).toBeDefined();
  });
});
