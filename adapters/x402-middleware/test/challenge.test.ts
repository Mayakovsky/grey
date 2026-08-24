import { describe, it, expect } from 'vitest';
import { buildPaymentRequirements, buildCdpBazaarExtension } from '../src/challenge.js';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import { TEST_CFG } from './_sign.js';

describe('buildPaymentRequirements — strict-canonical x402', () => {
  it('emits one exact-scheme accepts entry carrying the route price', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'verify_whitepaper',
      '/v1/offerings/verify_whitepaper',
      'payment required',
    );
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    const a = body.accepts[0];
    expect(a.scheme).toBe('exact');
    expect(a.network).toBe('eip155:84532');
    expect(a.maxAmountRequired).toBe('1500000');
    expect(a.payTo).toBe(TEST_CFG.payTo);
    expect(a.asset).toBe(TEST_CFG.usdc.address);
    expect(a.maxTimeoutSeconds).toBe(120);
    expect(a.resource).toBe('/v1/offerings/verify_whitepaper');
    expect(a.extra.name).toBe(TEST_CFG.usdc.name);
    expect(a.extra.version).toBe(TEST_CFG.usdc.version);
    expect(body.error).toBe('payment required');
  });

  it('omits server nonce/expiresAt (strict-canonical ruling)', () => {
    const body = buildPaymentRequirements(TEST_CFG, 'legitimacy_scan', '/r');
    expect(body).not.toHaveProperty('nonce');
    expect(body).not.toHaveProperty('expiresAt');
    expect(body.accepts[0]).not.toHaveProperty('nonce');
    expect(body.accepts[0]).not.toHaveProperty('expiresAt');
  });

  it('omits error when none is given', () => {
    expect(buildPaymentRequirements(TEST_CFG, 'legitimacy_scan', '/r').error).toBeUndefined();
  });

  it('carries per-slug pricing', () => {
    expect(
      buildPaymentRequirements(TEST_CFG, 'verify_whitepaper', '/r').accepts[0].maxAmountRequired,
    ).toBe('1500000');
    expect(
      buildPaymentRequirements(TEST_CFG, 'quick_protocol_facts', '/r').accepts[0].maxAmountRequired,
    ).toBe('300000');
  });

  it('carries Bazaar discovery metadata from the single EvaluationKit source (E1-B, Invariant #33)', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'legitimacy_scan',
      '/v1/offerings/legitimacy_scan',
    );
    const bazaar = body.accepts[0].extra.bazaar;
    expect(bazaar.discoverable).toBe(true);
    expect(bazaar.serviceName).toBe('Project Legitimacy Scan');
    expect(bazaar.tags).toContain('crypto');
    expect(typeof bazaar.description).toBe('string');
    expect(bazaar.inputSchema).toBeTruthy();
    expect(bazaar.outputSchema).toBeTruthy();
    expect(bazaar.iconUrl).toBe('https://whitepapergrey.com/icons/legitimacy_scan.svg');
  });

  it('CDP/Bazaar alignment Phase 1: also carries the top-level extensions.bazaar shape, alongside (not replacing) extra.bazaar', () => {
    const body = buildPaymentRequirements(
      TEST_CFG,
      'legitimacy_scan',
      '/v1/offerings/legitimacy_scan',
    );
    // extra.bazaar is untouched — Task 3 says keep it, other consumers may read it.
    expect(body.accepts[0].extra.bazaar).toBeTruthy();
    // extensions sits at the top of the body, sibling to accepts, not inside accepts[0].
    expect(body.extensions).toBeTruthy();
    expect(body).not.toHaveProperty('accepts[0].extensions');
    // Real shape from @x402/extensions/bazaar's declareDiscoveryExtension — see
    // buildCdpBazaarExtension's doc comment (CDP-PHASE2-use-declareDiscoveryExtension-KOV-
    // directive.md) for the trace confirming this against the library's own compiled source.
    const ext = body.extensions!.bazaar as {
      info: { input: Record<string, unknown>; output?: { type: string; example: unknown } };
      schema: {
        type: string;
        required: string[];
        properties: {
          input: { required: string[]; properties: { body: unknown } };
          output?: unknown;
        };
      };
    };
    expect(ext.info.input.type).toBe('http');
    expect(ext.info.input.method).toBe('POST');
    expect(ext.info.input.bodyType).toBe('json');
    // info.input.body is a REAL, schema-valid example request — not transport metadata. That was
    // the actual bug behind two prior failed attempts (see buildCdpBazaarExtension's doc comment).
    expect(ext.info.input.body).toEqual(buildEvaluationArtifact('legitimacy_scan').sample!.request);
    expect(ext.info.output?.example).toBeTruthy(); // legitimacy_scan has a sample response (Round 2)
    expect(ext.schema.type).toBe('object');
    expect(ext.schema.required).toEqual(['input']);
    expect(ext.schema.properties.input.required).toEqual(['type', 'method', 'bodyType', 'body']);
    // the real per-offering request schema — nested two levels deep (schema.properties.input
    // .properties.body), confirmed from @x402/extensions' own source, not guessed a third time.
    // directive-131: the bazaar-declared copy has its external $id stripped (CDP's real validator
    // rejects it); extra.bazaar's copy is untouched, so they now genuinely differ by exactly $id.
    const { $id: strippedId, ...rawInputSchemaWithoutId } = body.accepts[0].extra.bazaar
      .inputSchema as Record<string, unknown>;
    expect(strippedId).toBeTruthy(); // sanity: the real schema really does carry one to strip
    expect(ext.schema.properties.input.properties.body).toEqual(rawInputSchemaWithoutId);
    expect(ext.schema.properties.input.properties.body).not.toHaveProperty('$id');
  });

  it('buildCdpBazaarExtension is a pure reshape — same output for the same EvaluationKitEntry input', () => {
    const kitA = { inputSchema: { type: 'object' }, sample: undefined } as never;
    const extA = buildCdpBazaarExtension(kitA);
    expect(extA.bazaar.schema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
            bodyType: { type: 'string', enum: ['json', 'form-data', 'text'] },
            body: { type: 'object' },
          },
          required: ['type', 'method', 'bodyType', 'body'],
          additionalProperties: false,
        },
      },
      required: ['input'],
    });
    expect(extA.bazaar.info.output).toBeUndefined(); // no sample -> no output example, not a fabricated one
  });

  it('directive-131: strips an external $id from inputSchema before it reaches the bazaar declaration', () => {
    const kitB = {
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://schemas.whitepapergrey.com/v1/requests/example.schema.json',
        type: 'object',
        properties: { token_address: { type: 'string' } },
        required: ['token_address'],
      },
      sample: undefined,
    } as never;
    const extB = buildCdpBazaarExtension(kitB);
    const schema = extB.bazaar.schema as { properties: { input: { properties: { body: Record<string, unknown> } } } };
    const body = schema.properties.input.properties.body;
    expect(body).not.toHaveProperty('$id');
    // $schema (the meta-schema URI, not a document reference) is untouched — only $id/$ref strip.
    expect(body.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(body.type).toBe('object');
    expect(body.required).toEqual(['token_address']);
  });

  it('directive-131: a same-document $ref fragment (e.g. "#/definitions/foo") is kept, not stripped', () => {
    const kitC = {
      inputSchema: {
        type: 'object',
        properties: { verdict: { $ref: '#/definitions/Verdict' } },
        definitions: { Verdict: { type: 'string' } },
      },
      sample: undefined,
    } as never;
    const extC = buildCdpBazaarExtension(kitC);
    const schemaC = extC.bazaar.schema as unknown as {
      properties: { input: { properties: { body: { properties: { verdict: { $ref: string } } } } } };
    };
    expect(schemaC.properties.input.properties.body.properties.verdict.$ref).toBe('#/definitions/Verdict');
  });

  it('directive-131: an external (non-fragment) $ref is stripped, not just $id', () => {
    const kitD = {
      inputSchema: {
        type: 'object',
        properties: {
          verdict: { $ref: 'https://schemas.whitepapergrey.com/v1/_shared.schema.json#/$defs/Verdict' },
        },
      },
      sample: undefined,
    } as never;
    const extD = buildCdpBazaarExtension(kitD);
    const schemaD = extD.bazaar.schema as unknown as {
      properties: { input: { properties: { body: { properties: { verdict: Record<string, unknown> } } } } };
    };
    expect(schemaD.properties.input.properties.body.properties.verdict).not.toHaveProperty('$ref');
  });
});
