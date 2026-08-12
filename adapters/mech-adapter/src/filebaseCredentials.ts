// Isolated Filebase credential loader (BION-DIRECTIVE-45) — mirrors agentInstanceSigner.ts's
// isolation posture (invariant #30): this credential's env var names, and the one function that
// reads them, live in this single file under adapters/mech-adapter/src/, never reachable from
// packages/grey-core/src/. Not wired through config.ts/loadConfig() for the same reason
// agentInstanceSigner.ts isn't (see that file's header): this is a new, not-yet-live third-party
// credential, not part of this adapter's already-gated, already-tested MechAdapterConfig surface.
//
// Filebase is S3-compatible (endpoint s3.filebase.com, real AWS SigV4 auth) — confirmed directly
// against Filebase's own docs (filebase.com/docs/s3-api/overview, filebase.com/docs/ipfs/overview)
// and corroborated by real, independent usage examples (`aws s3api head-object --endpoint
// https://s3.filebase.com ...` reading a real `x-amz-meta-cid` response header), not assumed.
// D-38-ADDENDUM's static metadata pin already used this same real service (bucket `grey-olas`),
// uploaded once, by hand, via Forces' own Filebase dashboard/CLI — this file is the first REAL
// CODE integration against that account, for dynamic per-response pinning (Task 1). A NEW, separate
// bucket (not `grey-olas`) is used here — see responsePinner.ts's file header for why.
//
// Provisioning the real key is explicitly OUT of scope for this directive ("don't provision the
// actual Filebase API key yourself") — this function only reads what Forces fills into
// /etc/grey/mech-adapter.env; it never generates, requests, or defaults any of these values.
import process from 'node:process';

export interface FilebaseCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    throw new Error(`mech-adapter: missing required env ${key}`);
  }
  return v.trim();
}

/** Reads the three Filebase env vars this adapter needs — fail-closed, same posture as every
 *  other required-env read in this repo (config.ts's `required`/`requiredAddress`,
 *  agentInstanceSigner.ts's own private-key read). The only place in this codebase these env var
 *  names may appear (same one-file-is-the-audit-surface posture as invariant #30). */
export function loadFilebaseCredentialsFromEnv(env: Env = process.env): FilebaseCredentials {
  return {
    accessKeyId: required(env, 'MECH_ADAPTER_FILEBASE_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'MECH_ADAPTER_FILEBASE_SECRET_ACCESS_KEY'),
    bucket: required(env, 'MECH_ADAPTER_FILEBASE_BUCKET'),
  };
}
