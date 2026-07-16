import { describe, it, expect } from 'vitest';
import { stripSslParams, defaultFallbackRpc } from '../../src/main.js';

describe('stripSslParams — FDQ-46-B (SSL posture cannot be overridden by the URL)', () => {
  it('removes sslmode while preserving every other component', () => {
    const out = stripSslParams(
      'postgres://grey_pipeline_rw.ref:pw@pooler.example.com:6543/postgres?sslmode=require',
    );
    expect(out).not.toContain('sslmode');
    expect(out).toContain('grey_pipeline_rw.ref');
    expect(out).toContain('pooler.example.com:6543');
    expect(out).toContain('/postgres');
  });

  it('removes sslmode=no-verify too (code posture wins regardless of URL wording)', () => {
    expect(stripSslParams('postgres://u:p@h:6543/db?sslmode=no-verify')).not.toContain('sslmode');
  });

  it('removes a legacy ssl param and keeps unrelated params', () => {
    const out = stripSslParams('postgres://u:p@h:6543/db?ssl=true&application_name=sweeper');
    expect(out).not.toContain('ssl=true');
    expect(out).toContain('application_name=sweeper');
  });

  it('is a no-op for URLs without SSL params', () => {
    const url = 'postgres://u:p@h:6543/db';
    expect(stripSslParams(url)).toContain('h:6543/db');
  });

  it('passes non-URL-parseable strings through untouched (pg will fail loudly)', () => {
    expect(stripSslParams('not a url')).toBe('not a url');
  });
});

describe('defaultFallbackRpc — chain-matched public backup', () => {
  it('maps mainnet → mainnet.base.org and Sepolia → sepolia.base.org', () => {
    expect(defaultFallbackRpc(8453)).toBe('https://mainnet.base.org');
    expect(defaultFallbackRpc(84532)).toBe('https://sepolia.base.org');
  });
});
