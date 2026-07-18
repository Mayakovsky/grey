import { describe, it, expect } from 'vitest';
import { redactError } from '../../src/errors.js';
import { appendSweepLog } from '../../src/log.js';
import { appendRefuelLog } from '../../src/refuel/log.js';
import { alertCritical } from '../../src/alert.js';

const LEAK = 'RPC Request failed. URL: https://base-mainnet.g.alchemy.com/v2/SECRETKEY body';

describe('redactError (FDQ-56) — no secret survives into a persisted row/log', () => {
  it('strips a keyed RPC URL; no `http` substring and no key survive', () => {
    const err = new Error(
      'RPC Request failed. URL: https://base-mainnet.g.alchemy.com/v2/SECRETKEY123 Request body: {...}',
    );
    const out = redactError(err);
    expect(out).not.toContain('http');
    expect(out).not.toContain('alchemy.com');
    expect(out).not.toContain('SECRETKEY123');
    expect(out).toContain('[url-redacted]');
  });

  it('reproduces the exact FDQ-56 leak (viem eth_sendRawTransaction error) and neutralizes it', () => {
    const viemMsg =
      'The method "eth_sendRawTransaction" does not exist. URL: https://base-mainnet.g.alchemy.com/v2/abcdefKEY body';
    const out = redactError(viemMsg);
    expect(out).not.toMatch(/http|alchemy\.com|abcdefKEY/);
  });

  it('strips key=/token=/secret= segments even without a URL', () => {
    const out = redactError(new Error('auth failed apiKey=abc123 token: xyz9 secret=hunter2'));
    expect(out).not.toMatch(/abc123|xyz9|hunter2/);
  });

  it('passes a clean message through unchanged and handles non-Error input', () => {
    expect(redactError(new Error('post-swap WETH balance 0 below minOut 105'))).toBe(
      'post-swap WETH balance 0 below minOut 105',
    );
    expect(redactError('replacement transaction underpriced')).toBe('replacement transaction underpriced');
  });
});

describe('FDQ-56 sink choke points — redaction happens where text LANDS, not at call sites', () => {
  it('sweep path: appendSweepLog can NEVER persist an http substring into sweep_log.error_msg', async () => {
    let params: ReadonlyArray<unknown> | undefined;
    const pool = {
      query: async (_text: string, p?: ReadonlyArray<unknown>) => {
        params = p;
        return { rows: [] as Array<Record<string, unknown>> };
      },
    };
    await appendSweepLog(pool, {
      txHash: null,
      amountWei: null,
      source: '0xagent',
      destination: '0xpool',
      status: 'failed',
      errorClass: 'RpcDownError',
      errorMsg: LEAK, // caller passes RAW error text — the sink must redact it
      chainId: 8453,
    });
    const errMsg = String(params![6]); // $7 = error_msg
    expect(errMsg).not.toContain('http');
    expect(errMsg).not.toContain('SECRETKEY');
  });

  it('refuel path: appendRefuelLog can NEVER persist an http substring into error_detail_redacted', async () => {
    let params: ReadonlyArray<unknown> | undefined;
    const pool = {
      query: async (_text: string, p?: ReadonlyArray<unknown>) => {
        params = p;
        return { rows: [] as Array<Record<string, unknown>> };
      },
    };
    await appendRefuelLog(pool, {
      chainId: 8453,
      relayerBalanceBeforeWei: 0n,
      deficitWei: null,
      usdcIn: null,
      quoteOutWei: null,
      minOutWei: null,
      swapTx: null,
      unwrapTx: null,
      transferTx: null,
      ethDeliveredWei: null,
      status: 'failed',
      errorClass: 'TransactionExecutionError',
      errorDetail: LEAK,
    });
    const detail = String(params![12]); // $13 = error_detail_redacted
    expect(detail).not.toContain('http');
    expect(detail).not.toContain('SECRETKEY');
  });

  it('alert path: alertCritical redacts the URL/key out of the ntfy body before it is sent', async () => {
    let sent = '';
    const deps = {
      opsUrl: 'ops',
      critUrl: 'crit',
      user: 'u',
      pass: 'p',
      delay: async () => {},
      post: async (_url: string, o: { body: string }) => {
        sent = o.body;
        return { statusCode: 200 };
      },
    };
    await alertCritical('sweeper: rpc failed', { error: LEAK }, deps);
    expect(sent).not.toContain('http');
    expect(sent).not.toContain('SECRETKEY');
  });
});
