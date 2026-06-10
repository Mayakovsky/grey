// grey-pipeline — Anthropic client (raw fetch; no SDK dependency).
// D-ANTHROPIC: ported verbatim from plugin-wpv/src/verification/anthropicFetchClient.ts.
// The AnthropicClient interface lives here (in plugin-wpv it lived in ClaimExtractor;
// moved here to avoid the circular import). Logic unchanged.

export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
      tools: unknown[];
    }): Promise<{
      content: { type: string; input?: Record<string, unknown>; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export function createAnthropicClient(apiKey: string): AnthropicClient {
  return {
    messages: {
      async create(params) {
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: params.model,
                max_tokens: params.max_tokens,
                system: params.system,
                messages: params.messages,
                tools: params.tools,
              }),
              signal: AbortSignal.timeout(120000), // 2 min for LLM calls
            });

            if (response.status === 429) {
              // Rate limited — retry with exponential backoff
              const retryAfter = response.headers.get('retry-after');
              const waitMs = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : Math.min(2000 * Math.pow(2, attempt), 30000);
              if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
              }
              const text = await response.text();
              throw new Error(
                `Anthropic API error 429 after ${MAX_RETRIES} retries: ${text.slice(0, 200)}`,
              );
            }

            if (response.status === 529 || response.status >= 500) {
              // Server error — retry
              if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
                continue;
              }
              const text = await response.text();
              throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`);
            }

            if (!response.ok) {
              const text = await response.text();
              throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`);
            }

            const data = (await response.json()) as {
              content: { type: string; input?: Record<string, unknown>; text?: string }[];
              usage: { input_tokens: number; output_tokens: number };
            };

            return data;
          } catch (err) {
            lastError = err as Error;
            // Don't retry on non-retryable errors (4xx except 429)
            if (
              lastError.message.includes('Anthropic API error 4') &&
              !lastError.message.includes('429')
            ) {
              throw lastError;
            }
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
              continue;
            }
          }
        }

        throw lastError ?? new Error('Anthropic API call failed after retries');
      },
    },
  };
}
