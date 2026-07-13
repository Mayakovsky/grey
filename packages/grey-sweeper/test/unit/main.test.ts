import { describe, it, expect } from 'vitest';
import { installSignalAbort } from '../../src/main.js';

// Exercises the entrypoint's only mockable seam — signal → abort ordering — with injected
// handlers + a real AbortController. No live viem/pg/ntfy clients (those aren't unit-testable).
function harness() {
  const handlers: Partial<Record<'SIGTERM' | 'SIGINT', () => void>> = {};
  const controller = new AbortController();
  const logs: string[] = [];
  installSignalAbort({
    controller,
    on: (sig, cb) => {
      handlers[sig] = cb;
    },
    log: (m) => logs.push(m),
  });
  return { handlers, controller, logs };
}

describe('installSignalAbort', () => {
  it('registers both SIGTERM and SIGINT handlers', () => {
    const { handlers } = harness();
    expect(typeof handlers.SIGTERM).toBe('function');
    expect(typeof handlers.SIGINT).toBe('function');
  });

  it('SIGTERM aborts the sweep-loop signal', () => {
    const { handlers, controller } = harness();
    expect(controller.signal.aborted).toBe(false);
    handlers.SIGTERM!();
    expect(controller.signal.aborted).toBe(true);
  });

  it('SIGINT aborts the sweep-loop signal', () => {
    const { handlers, controller } = harness();
    handlers.SIGINT!();
    expect(controller.signal.aborted).toBe(true);
  });

  it('is idempotent — a second signal during shutdown is ignored (logs once)', () => {
    const { handlers, controller, logs } = harness();
    handlers.SIGTERM!();
    handlers.SIGINT!(); // arrives during drain
    expect(controller.signal.aborted).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it('names the received signal in the drain log', () => {
    const { handlers, logs } = harness();
    handlers.SIGINT!();
    expect(logs[0]).toContain('SIGINT');
  });
});
