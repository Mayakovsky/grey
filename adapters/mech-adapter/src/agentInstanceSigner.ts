// Isolated hot-key loader for BASE_MECH_AGENT_INSTANCE — the sole (threshold=1) signer of Grey's
// real mech service's Safe multisig (BION-DIRECTIVE-38). Mirrors the established isolated-hot-key
// pattern (grey-sweeper/src/wallet.ts for GREY_AGENT_WALLET_PRIVATE_KEY, docs/INVARIANTS.md #17;
// adapters/x402-middleware for X402_RELAYER_PRIVATE_KEY, #19) — new invariant #30 confines this
// key's string and its materialization to this one file, under adapters/mech-adapter/src/, never
// reachable from packages/grey-core/src/.
//
// Deliberately NOT wired through config.ts/loadConfig() the way the sweeper's key is: mech-
// adapter's own established precedent (BASE_MECH_AGENT_INSTANCE_ADDRESS, config.ts) already keeps
// not-yet-live sensitive fields OUT of loadConfig()'s env-driven surface rather than adding an
// unused knob to an already-gated test surface. Keeping the env read AND the key materialization
// in this single file (rather than splitting across config.ts + a wallet.ts, as the sweeper does)
// is a tighter version of the same isolation goal — one file is the entire audit surface for this
// key's lifecycle, not two.
//
// This module builds NOTHING that submits a transaction on its own — see safeDeliveryClient.ts for
// the signing/submission path this account gets injected into. Building this capability does not
// turn it on: nothing in this adapter calls loadAgentInstanceAccount() automatically (BION-
// DIRECTIVE-38 scope — see mechAdapter.ts's file header).
import process from 'node:process';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

type Env = Record<string, string | undefined>;

/** Converts an already-loaded raw private key into a signing account. Mirrors grey-sweeper's
 *  `loadAgentAccount` shape exactly (key in, account out — no env access here). */
export function loadAgentInstanceAccount(privateKey: `0x${string}`): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}

/** Reads `BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY` from env — fail-closed, same posture as every
 *  other required-env read in this repo (config.ts's `required`/`requiredAddress`). The only place
 *  in this codebase this env var's name may appear (invariant #30). */
export function loadAgentInstancePrivateKeyFromEnv(env: Env = process.env): `0x${string}` {
  const raw = env.BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error('mech-adapter: missing required env BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY');
  }
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error('mech-adapter: BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY is not a valid 32-byte 0x-hex private key');
  }
  return trimmed as `0x${string}`;
}
