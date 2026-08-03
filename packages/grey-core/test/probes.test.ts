import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';
import type { HandlerDeps, GreyCoreConfig } from '../src/deps';
import { passThroughX402Gate } from './_helpers';

const CONFIG: GreyCoreConfig = {
  version: '0.1.0-test',
  did: 'did:erc8004:8453:58618',
  name: 'Whitepaper Grey',
  runtime: 'grey-core',
  payTo: '0x0000000000000000000000000000000000000000',
  network: 'eip155:84532',
};

// Probes don't touch db/repos — stub them. Logger is a silent no-op matching the Logger interface.
function fakeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const noop = (): void => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop, child: (): unknown => logger };
  return {
    db: {} as HandlerDeps['db'],
    whitepapers: {} as HandlerDeps['whitepapers'],
    verifications: {} as HandlerDeps['verifications'],
    claims: {} as HandlerDeps['claims'],
    revenueEvents: {} as HandlerDeps['revenueEvents'],
    logger: logger as unknown as HandlerDeps['logger'],
    clock: () => new Date('2026-06-14T00:00:00.000Z'),
    config: CONFIG,
    // M3.5: probes don't touch live-compute deps — bare stubs satisfy the shape.
    pipeline: {} as unknown as HandlerDeps['pipeline'],
    discovery: {} as unknown as HandlerDeps['discovery'],
    ...overrides,
  };
}

describe('probes (app.inject)', () => {
  it('GET /health → 200 ok + version + numeric uptimeSec', async () => {
    const app = buildServer(fakeDeps(), passThroughX402Gate);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0-test');
    expect(typeof body.uptimeSec).toBe('number');
    await app.close();
  });

  it('GET /identity → DID + agent shape', async () => {
    const app = buildServer(fakeDeps(), passThroughX402Gate);
    const res = await app.inject({ method: 'GET', url: '/identity' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      did: 'did:erc8004:8453:58618',
      name: 'Whitepaper Grey',
      runtime: 'grey-core',
      version: '0.1.0-test',
    });
    await app.close();
  });

  it('GET /openapi → 200 application/yaml with the spec body', async () => {
    const app = buildServer(fakeDeps(), passThroughX402Gate);
    const res = await app.inject({ method: 'GET', url: '/openapi' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/yaml');
    expect(res.body).toContain('openapi:');
    await app.close();
  });
});
