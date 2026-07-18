import process from 'node:process';

/** Gas balance too low to broadcast — recoverable (retry next tick). */
export class GasLowError extends Error {
  override readonly name = 'GasLowError';
  constructor(message = 'gas balance too low to broadcast') {
    super(message);
  }
}

/** RPC endpoint unreachable / errored — recoverable (retry next tick). */
export class RpcDownError extends Error {
  override readonly name = 'RpcDownError';
  constructor(message = 'rpc endpoint unreachable') {
    super(message);
  }
}

/** Destination did not match the hard-coded allowlist — CRITICAL, never recover. */
export class NonAllowlistError extends Error {
  override readonly name = 'NonAllowlistError';
  constructor(message = 'sweep destination is not the allowlisted pool wallet') {
    super(message);
  }
}

/** Broadcast was mined but reverted — unrecoverable, escalate. */
export class BroadcastRevertError extends Error {
  override readonly name = 'BroadcastRevertError';
  constructor(message = 'sweep transaction reverted on-chain') {
    super(message);
  }
}

export type SweeperError =
  | GasLowError
  | RpcDownError
  | NonAllowlistError
  | BroadcastRevertError;

/**
 * Recoverable errors (GasLow / RpcDown) → safe to retry on the next tick.
 * Non-recoverable (NonAllowlist / BroadcastRevert) → critical escalation.
 */
export function isRecoverable(err: unknown): boolean {
  return err instanceof GasLowError || err instanceof RpcDownError;
}

/** Stable class name for the sweep_log.error_class column. */
export function errorClass(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  return 'UnknownError';
}

/**
 * FDQ-56: strip secrets from error text BEFORE it reaches a persisted row
 * (refuel_log/sweep_log error_detail) or any log line. viem embeds the full RPC
 * request URL — which carries the provider API key — in error messages; the
 * FDQ-43 posture covered ntfy creds but not this, so a keyed URL leaked into
 * grey_two.refuel_log. Removes any `scheme://…` URL and any `key=`/`token=`-shaped
 * segment. Post-condition: no `http` substring survives into the returned string.
 */
export function redactError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url-redacted]')
    .replace(/\b(api[_-]?key|key|token|secret|password|pass)\s*[=:]\s*\S+/gi, '$1=[redacted]');
}

/**
 * The stderr/journal choke point (FDQ-56): every error bound for a log line goes
 * through here so it is redacted by construction — callers never format raw error
 * text for stderr themselves.
 */
export function logError(prefix: string, err: unknown): void {
  process.stderr.write(`${prefix}${redactError(err)}\n`);
}
