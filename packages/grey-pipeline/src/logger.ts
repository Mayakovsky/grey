// grey-pipeline — logger.
// D-LOGGER: pino-backed, but exposes the same call-site shape as plugin-wpv's
// custom logger (`(message, ctx?, error?)` + `child(ctx)`) so the ported component
// code is unchanged. Components receive a `Logger` via PipelineDeps and may call
// `.child({ component: 'X' })`.

import pino, { type Logger as PinoLogger } from 'pino';

export interface Logger {
  debug(message: string, ctx?: Record<string, unknown>): void;
  info(message: string, ctx?: Record<string, unknown>): void;
  warn(message: string, ctx?: Record<string, unknown>, error?: unknown): void;
  error(message: string, ctx?: Record<string, unknown>, error?: unknown): void;
  child(context: Record<string, unknown>): Logger;
}

function wrap(p: PinoLogger): Logger {
  return {
    debug: (message, ctx) => p.debug(ctx ?? {}, message),
    info: (message, ctx) => p.info(ctx ?? {}, message),
    warn: (message, ctx, error) => p.warn(error ? { ...ctx, err: error } : (ctx ?? {}), message),
    error: (message, ctx, error) => p.error(error ? { ...ctx, err: error } : (ctx ?? {}), message),
    child: (context) => wrap(p.child(context)),
  };
}

const root = pino({
  level: (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || 'info',
  base: { service: 'grey-pipeline' },
});

export function createLogger(context: Record<string, unknown> = {}): Logger {
  return wrap(root.child(context));
}
