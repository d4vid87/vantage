/**
 * Ollama adapter — the local-first default. Runs entirely on your own
 * hardware, so the operational picture never leaves the box.
 */
import { ProviderUnconfiguredError, type GenerateOptions, type LLMProvider } from './provider';

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

export function createOllamaProvider(): LLMProvider {
  const base = (process.env.OLLAMA_URL || DEFAULT_URL).replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

  return {
    name: 'ollama',
    model,
    async generate({ system, prompt, temperature, maxTokens }: GenerateOptions): Promise<string> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            options: {
              temperature: temperature ?? 0.4,
              ...(maxTokens ? { num_predict: maxTokens } : {}),
            },
          }),
        });
      } catch (err) {
        throw new ProviderUnconfiguredError(
          'ollama',
          `cannot reach Ollama at ${base} (${(err as Error).message}). Start it with \`ollama serve\` or set OLLAMA_URL.`
        );
      }

      if (res.status === 404) {
        throw new ProviderUnconfiguredError(
          'ollama',
          `model "${model}" is not pulled. Run \`ollama pull ${model}\` or set OLLAMA_MODEL.`
        );
      }
      if (!res.ok) {
        throw new Error(`Ollama returned ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = (await res.json()) as OllamaChatResponse;
      if (data.error) throw new Error(`Ollama error: ${data.error}`);
      return data.message?.content?.trim() ?? '';
    },
  };
}
