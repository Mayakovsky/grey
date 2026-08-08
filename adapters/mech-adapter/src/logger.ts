// Minimal structured logger (JSON lines → stderr), so the adapter has no @elizaos/core dependency.
// child() binds context fields onto every line. Byte-identical to acp-adapter's copy (same
// convention — each adapter package is self-contained, no shared adapters/common package exists).
import process from 'node:process';

export interface AdapterLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  child(bound: Record<string, unknown>): AdapterLogger;
}

export function createLogger(bound: Record<string, unknown> = {}): AdapterLogger {
  const emit = (level: string, msg: string, meta?: Record<string, unknown>): void => {
    const line = { level, msg, ...bound, ...(meta ?? {}) };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  };
  return {
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    debug: (m, meta) => emit('debug', m, meta),
    child: (extra) => createLogger({ ...bound, ...extra }),
  };
}

/** A no-op logger for tests. */
export function silentLogger(): AdapterLogger {
  const noop = (): void => {};
  const l: AdapterLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => l,
  };
  return l;
}
