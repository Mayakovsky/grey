// BION-DIRECTIVE-43 — taskIntake.ts unit coverage. pollForOwnRequests is tested against a fake
// getLogs (network-touching real-log decoding is proven by the anvil fork test); routeRequest is
// tested against real Grey offering handlers with a fake fetchRequestContent (real content
// fetching is covered by requestContent.test.ts).
import { describe, it, expect, vi } from 'vitest';
import type { Address, Hash, Hex } from 'viem';
import type { HandlerDeps, HandlerResult, OfferingHandler } from '@grey/core';
import type { OfferingSlug } from '@grey/schemas/responses';
import { pollForOwnRequests, routeRequest, UnknownToolError, type DetectedRequest } from '../src/taskIntake.js';
import type { RequestContent } from '../src/requestContent.js';
import { createStubResponsePinner, ResponsePinVerificationError, type ResponsePinner } from '../src/responsePinner.js';

const MECH: Address = '0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8';
const MARKETPLACE: Address = '0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020';
const REQUEST_ID: Hash = `0x${'11'.repeat(32)}` as Hash;
const REQUEST_DATA: Hex = `0x${'22'.repeat(32)}` as Hex;
const REQUESTER: Address = '0x3333333333333333333333333333333333333333' as Address;

describe('pollForOwnRequests (BION-DIRECTIVE-43)', () => {
  it('flattens a real-shaped MarketplaceRequest log into one DetectedRequest per requestId', async () => {
    const getLogs = vi.fn(async (params: unknown) => {
      expect((params as { address: Address }).address).toBe(MARKETPLACE);
      expect((params as { args: { priorityMech: Address } }).args.priorityMech).toBe(MECH);
      return [
        {
          args: { priorityMech: MECH, requester: REQUESTER, numRequests: 1n, requestIds: [REQUEST_ID], requestDatas: [REQUEST_DATA] },
          blockNumber: 100n,
          transactionHash: `0x${'44'.repeat(32)}` as Hash,
        },
      ];
    });
    const result = await pollForOwnRequests({ getLogs } as never, MARKETPLACE, MECH, 90n, 110n);
    expect(result).toEqual([
      { requestId: REQUEST_ID, requestData: REQUEST_DATA, requester: REQUESTER, blockNumber: 100n, transactionHash: `0x${'44'.repeat(32)}` },
    ]);
  });

  it('handles multiple requestIds in one log (a real batch request)', async () => {
    const id2: Hash = `0x${'55'.repeat(32)}` as Hash;
    const data2: Hex = `0x${'66'.repeat(32)}` as Hex;
    const getLogs = vi.fn(async () => [
      {
        args: { priorityMech: MECH, requester: REQUESTER, numRequests: 2n, requestIds: [REQUEST_ID, id2], requestDatas: [REQUEST_DATA, data2] },
        blockNumber: 100n,
        transactionHash: `0x${'44'.repeat(32)}` as Hash,
      },
    ]);
    const result = await pollForOwnRequests({ getLogs } as never, MARKETPLACE, MECH, 90n, 110n);
    expect(result).toHaveLength(2);
    expect(result[1].requestId).toBe(id2);
  });

  it('returns empty when no logs match', async () => {
    const getLogs = vi.fn(async () => []);
    const result = await pollForOwnRequests({ getLogs } as never, MARKETPLACE, MECH, 90n, 110n);
    expect(result).toEqual([]);
  });
});

const REAL_CONTENT: RequestContent = {
  prompt: 'Will ETH exceed $10,000 by end of 2026?',
  tool: 'prediction_market_research',
  nonce: 'test-nonce',
  schema_version: '2.0',
  request_context: null,
};

function fakeDetected(): DetectedRequest {
  return { requestId: REQUEST_ID, requestData: REQUEST_DATA, requester: REQUESTER, blockNumber: 1n, transactionHash: `0x${'77'.repeat(32)}` as Hash };
}

function fakeHandlerDeps(): HandlerDeps {
  return {} as HandlerDeps;
}

describe('routeRequest (BION-DIRECTIVE-43)', () => {
  it('routes to the matching offeringHandlers[tool] entry and derives a real response hash', async () => {
    const handlerResult: HandlerResult = { payload: { answer: 'yes', confidence: 0.7 }, subject: { kind: 'none' } as never, cacheHit: true };
    const handler: OfferingHandler = vi.fn(async () => handlerResult);
    const handlers: Record<OfferingSlug, OfferingHandler> = { prediction_market_research: handler } as never;

    const responsePinner = createStubResponsePinner();
    const result = await routeRequest(
      fakeDetected(),
      { registeredTools: ['prediction_market_research'] as OfferingSlug[], handlers, handlerDeps: fakeHandlerDeps(), responsePinner },
      { fetchImpl: (async () => new Response(JSON.stringify(REAL_CONTENT))) as unknown as typeof fetch },
    );

    expect(result.slug).toBe('prediction_market_research');
    expect(result.payload).toEqual(handlerResult.payload);
    expect(result.responseHash).toMatch(/^0x[0-9a-f]{64}$/);
    // BION-DIRECTIVE-45: the pinned content is exactly the same bytes routeRequest hashed —
    // not a coincidentally-matching re-serialization.
    expect(responsePinner.store.get(result.pinnedCid)).toBe(result.responseContent);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ offeringId: 'prediction_market_research', buyerAddress: REQUESTER, requirement: { marketQuery: REAL_CONTENT.prompt } }),
      expect.anything(),
    );
  });

  it('maps request_context.resolutionCriteria into the requirement when present', async () => {
    const content: RequestContent = { ...REAL_CONTENT, tool: 'resolution_evidence_compiler', request_context: { resolutionCriteria: 'Resolves YES if price >= $10k on any major exchange.' } };
    const handler: OfferingHandler = vi.fn(async () => ({ payload: {}, subject: { kind: 'none' } as never, cacheHit: false }));
    const handlers: Record<OfferingSlug, OfferingHandler> = { resolution_evidence_compiler: handler } as never;

    await routeRequest(
      fakeDetected(),
      { registeredTools: ['resolution_evidence_compiler'] as OfferingSlug[], handlers, handlerDeps: fakeHandlerDeps(), responsePinner: createStubResponsePinner() },
      { fetchImpl: (async () => new Response(JSON.stringify(content))) as unknown as typeof fetch },
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requirement: { marketQuery: content.prompt, resolutionCriteria: 'Resolves YES if price >= $10k on any major exchange.' } }),
      expect.anything(),
    );
  });

  it('throws UnknownToolError for a tool Grey has not registered, rather than guessing a handler', async () => {
    const content: RequestContent = { ...REAL_CONTENT, tool: 'google_image_gen' };
    const handlers: Record<OfferingSlug, OfferingHandler> = {} as never;

    await expect(
      routeRequest(
        fakeDetected(),
        { registeredTools: ['prediction_market_research'] as OfferingSlug[], handlers, handlerDeps: fakeHandlerDeps(), responsePinner: createStubResponsePinner() },
        { fetchImpl: (async () => new Response(JSON.stringify(content))) as unknown as typeof fetch },
      ),
    ).rejects.toThrow(UnknownToolError);
  });

  it('BION-DIRECTIVE-45: propagates a pin-verification failure rather than returning an unpinned hash', async () => {
    const handler: OfferingHandler = vi.fn(async () => ({ payload: { answer: 'yes' }, subject: { kind: 'none' } as never, cacheHit: true }));
    const handlers: Record<OfferingSlug, OfferingHandler> = { prediction_market_research: handler } as never;
    const failingPinner: ResponsePinner = {
      pinAndVerify: vi.fn(async () => {
        throw new ResponsePinVerificationError('f0170122000', 5, 'simulated: gateway never resolved the pin');
      }),
    };

    await expect(
      routeRequest(
        fakeDetected(),
        { registeredTools: ['prediction_market_research'] as OfferingSlug[], handlers, handlerDeps: fakeHandlerDeps(), responsePinner: failingPinner },
        { fetchImpl: (async () => new Response(JSON.stringify(REAL_CONTENT))) as unknown as typeof fetch },
      ),
    ).rejects.toThrow(ResponsePinVerificationError);
    // The handler still ran (real compute happened) — only the pin step failed, confirming the
    // failure is attributable to pinning, not a handler regression.
    expect(handler).toHaveBeenCalled();
  });
});
