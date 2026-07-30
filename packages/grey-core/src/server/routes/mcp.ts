// POST /v1/mcp (E1-D) — the offering set exposed as paid MCP tools over the SAME x402 rail
// (spec §3 E1 bequeaths: "Bazaar indexes MCP tools alongside HTTP endpoints"). Hand-rolled
// JSON-RPC 2.0 dispatch, NOT the @modelcontextprotocol/sdk package — this repo's adapters
// deliberately avoid heavy transitive dependency trees on the memory-constrained production VPS
// (see adapters/acp-adapter/tsconfig.json's note on the M5 VPS OOM, and sdk.ts's dynamic-import
// pattern for the same reason). The wire shape (jsonrpc/id/method/params, tools/list, tools/call,
// CallToolResult{content,isError}) matches the real MCP spec closely enough for any conformant
// client, without pulling in the SDK.
//
// Payment: a tool call for a paid offering that arrives without `_meta.x402Payment` gets a
// CallToolResult{isError:true} carrying the SAME PaymentRequirements shape the HTTP 402 body
// would — the client base64-encodes an X-PAYMENT authorization into `_meta.x402Payment` and
// resubmits the SAME tools/call. Verify/settle reuse the exact functions the HTTP preHandler
// uses (decodePaymentHeader, verifyPayment, settle) — one payment implementation, two transports.
//
// Depends on sub-unit 1 (EvaluationKit): tools/list projects the SAME source every HTTP route's
// 402 body and the discovery index use — Invariant #33, no separate MCP-specific metadata.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { OfferingSlug, PaidOfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationKit } from '@grey/schemas/evaluationKit';
import {
  isPaidSlug,
  priceAtomicFor,
  priceUsdFor,
  decodePaymentHeader,
  verifyPayment,
  settle,
  buildPaymentRequirements,
  type X402Config,
} from '@grey/x402-middleware';
import type { PublicClientLike, WalletClientLike } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';
import { PAID } from './offerings';
import { FREE } from './resources';

const PROTOCOL_VERSION = '2026-03-26';
const MCP_TOOL_SLUGS: OfferingSlug[] = [...PAID, ...FREE];

export interface McpRouteDeps {
  x402Config: X402Config;
  wallet: WalletClientLike;
  publicClient: PublicClientLike;
  /** Injectable ms clock for deterministic tests (mirrors X402PreHandlerDeps). */
  now?: () => number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}
interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

function ok(id: JsonRpcRequest['id'], result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}
function fail(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
function textResult(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], isError };
}

function toolDef(slug: OfferingSlug): { name: string; description: string; inputSchema: object } {
  const kit = buildEvaluationKit(slug);
  return {
    name: slug,
    description: kit.description,
    inputSchema: kit.inputSchema ?? { type: 'object', properties: {}, additionalProperties: false },
  };
}

export function registerMcpRoute(
  app: FastifyInstance,
  deps: HandlerDeps,
  mcpDeps: McpRouteDeps,
): void {
  app.post('/v1/mcp', async (req, reply) => {
    const body = req.body as JsonRpcRequest;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      reply.send(fail(body?.id ?? null, -32600, 'invalid JSON-RPC request'));
      return;
    }
    const { id, method, params } = body;

    if (method === 'initialize') {
      reply.send(
        ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: deps.config.name, version: deps.config.version },
          capabilities: { tools: {} },
        }),
      );
      return;
    }

    if (method === 'tools/list') {
      // Registry-driven, same gating discipline as discovery.ts: only the normal 7 paid + 2 free
      // slugs are ever listed. The trust rung is never in MCP_TOOL_SLUGS regardless of its own
      // disable flag — E1-D's rail doesn't get a separate exposure decision from B-1.
      reply.send(ok(id, { tools: MCP_TOOL_SLUGS.map(toolDef) }));
      return;
    }

    if (method === 'tools/call') {
      const name = params?.name as string | undefined;
      if (!name || !MCP_TOOL_SLUGS.includes(name as OfferingSlug)) {
        reply.send(fail(id, -32602, `unknown or unlisted tool: ${String(name)}`));
        return;
      }
      const slug = name as OfferingSlug;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      const meta = (params?._meta as Record<string, unknown>) ?? {};

      const isFree = (FREE as readonly string[]).includes(slug);
      if (!isFree && isPaidSlug(slug)) {
        const paidSlug = slug as PaidOfferingSlug;
        const paymentHeader = meta.x402Payment as string | undefined;
        if (!paymentHeader) {
          reply.send(
            ok(
              id,
              textResult(buildPaymentRequirements(mcpDeps.x402Config, paidSlug, '/v1/mcp'), true),
            ),
          );
          return;
        }
        const decoded = decodePaymentHeader(paymentHeader);
        if (!decoded.ok) {
          reply.send(ok(id, textResult({ error: decoded.reason }, true)));
          return;
        }
        const nowSec = BigInt(Math.floor((mcpDeps.now?.() ?? Date.now()) / 1000));
        const verdict = await verifyPayment(
          mcpDeps.x402Config,
          decoded.payload,
          priceAtomicFor(paidSlug),
          mcpDeps.publicClient,
          nowSec,
        );
        if (!verdict.ok) {
          reply.send(ok(id, textResult({ error: verdict.reason }, true)));
          return;
        }
        let outcome;
        try {
          outcome = await settle(mcpDeps.x402Config, verdict.authorization, verdict.signature, {
            wallet: mcpDeps.wallet,
            publicClient: mcpDeps.publicClient,
          });
        } catch (err) {
          reply.send(ok(id, textResult({ error: 'settlement failed' }, true)));
          deps.logger.error('mcp: settlement infra error', {
            slug,
            reason: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        if (!outcome.ok) {
          reply.send(ok(id, textResult({ error: outcome.reason }, true)));
          return;
        }
      }

      const start = deps.clock().getTime();
      const result = await offeringHandlers[slug]({ offeringId: slug, requirement: args }, deps);
      const env = buildEnvelope({
        offering: slug,
        payload: result.payload as never,
        requestId: randomUUID(),
        config: deps.config,
        subject: result.subject,
        metadata: {
          costUsd: isFree ? 0 : priceUsdFor(slug),
          model: 'none',
          latencyMs: deps.clock().getTime() - start,
          timestamp: deps.clock().toISOString(),
          cacheHit: result.cacheHit,
        },
      });
      reply.send(ok(id, textResult(env)));
      return;
    }

    reply.send(fail(id, -32601, `method not found: ${method}`));
  });
}
