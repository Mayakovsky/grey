// NL requirement parser — the port must emit a CLEAN {token_address?, project_name?} that keys
// into the shared grey-core handlers, and the known-protocol regex must come from @grey/pipeline's
// canonical list (no third divergent copy).
import { describe, it, expect } from 'vitest';
import { parseRequirement } from '../src/parseRequirement.js';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';

describe('parseRequirement', () => {
  it('structured object → picks token_address/project_name (isPlainText=false)', () => {
    const r = parseRequirement({ token_address: TOKEN, project_name: 'Uniswap', extra: 'ignored' });
    expect(r).toEqual({ requirement: { token_address: TOKEN, project_name: 'Uniswap' }, isPlainText: false });
  });

  it('accepts camelCase tokenAddress/projectName in structured input', () => {
    const r = parseRequirement({ tokenAddress: TOKEN, projectName: 'Aave' });
    expect(r.requirement).toEqual({ token_address: TOKEN, project_name: 'Aave' });
    expect(r.isPlainText).toBe(false);
  });

  it('JSON string → parsed as structured', () => {
    const r = parseRequirement(JSON.stringify({ token_address: TOKEN }));
    expect(r).toEqual({ requirement: { token_address: TOKEN }, isPlainText: false });
  });

  it('plain text with address + known protocol → token + name (isPlainText=true)', () => {
    const r = parseRequirement(`Please verify Uniswap (${TOKEN}) for legitimacy`);
    expect(r.isPlainText).toBe(true);
    expect(r.requirement.token_address).toBe(TOKEN);
    expect(r.requirement.project_name).toBe('Uniswap');
  });

  it('plain text with address but no recognizable name → token only', () => {
    const r = parseRequirement(`scan ${TOKEN}`);
    expect(r.requirement.token_address).toBe(TOKEN);
    expect(r.isPlainText).toBe(true);
  });

  it('plain text with only a known protocol name → project_name only', () => {
    const r = parseRequirement('Analyze Chainlink please');
    expect(r.requirement).toEqual({ project_name: 'Chainlink' });
    expect(r.isPlainText).toBe(true);
  });

  it('drops the legacy raw_instruction / _signals stamps (clean subject only)', () => {
    const r = parseRequirement(`verify Aave (${TOKEN})`);
    expect(Object.keys(r.requirement).sort()).toEqual(['project_name', 'token_address']);
  });

  it('unparseable text → empty requirement (caller rejects)', () => {
    const r = parseRequirement('hello there');
    expect(r.requirement).toEqual({});
    expect(r.isPlainText).toBe(true);
  });

  it('non-string/non-object → empty', () => {
    expect(parseRequirement(42)).toEqual({ requirement: {}, isPlainText: false });
    expect(parseRequirement(null)).toEqual({ requirement: {}, isPlainText: false });
  });
});
