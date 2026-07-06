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
