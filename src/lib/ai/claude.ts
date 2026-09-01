/**
 * Anthropic Claude adapter — hosted, highest reasoning quality for
 * cross-source correlation and dossier narrative.
 *
 * Uses the Messages API directly over fetch so Vantage carries no extra SDK
 * dependency for a single endpoint.
 */
import { ProviderUnconfiguredError, type GenerateOptions, type LLMProvider } from './provider';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export function createClaudeProvider(): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderUnconfiguredError(
      'claude',
      'set ANTHROPIC_API_KEY (https://console.anthropic.com/settings/keys)'
    );
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  return {
    name: 'claude',
    model,
    async generate({ system, prompt, temperature, maxTokens }: GenerateOptions): Promise<string> {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model,
          system,
          max_tokens: maxTokens ?? 4096,
          temperature: temperature ?? 0.4,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = (await res.json()) as AnthropicResponse;
      if (!res.ok || data.error) {
        throw new Error(`Claude API ${res.status}: ${data.error?.message ?? 'unknown error'}`);
      }
      return (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
    },
  };
}
