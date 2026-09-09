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
    async generate({ system, prompt, temperature, maxTokens, signal }: GenerateOptions): Promise<string> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
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

    async *generateStream({ system, prompt, temperature, maxTokens, signal }: GenerateOptions) {
      let res: Response;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: true,
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
      if (!res.ok || !res.body) {
        throw new Error(`Ollama returned ${res.status}: ${await res.text().catch(() => '')}`);
      }

      // Ollama streams newline-delimited JSON; a chunk may split a line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as OllamaChatResponse;
            if (parsed.error) throw new Error(`Ollama error: ${parsed.error}`);
            const piece = parsed.message?.content;
            if (piece) yield piece;
          } catch {
            /* skip a malformed line rather than abort the stream */
          }
        }
      }
    },
  };
}
