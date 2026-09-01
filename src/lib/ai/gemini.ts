/**
 * Google Gemini adapter — kept for parity with upstream deployments.
 * Supports round-robin across GEMINI_API_KEY_1..8 for free-tier rate limits.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProviderUnconfiguredError, type GenerateOptions, type LLMProvider } from './provider';

const DEFAULT_MODEL = 'gemini-2.0-flash';

let keyIndex = 0;

export function geminiKeys(): string[] {
  const keys: string[] = [];
  const single = process.env.GEMINI_API_KEY?.trim();
  if (single) keys.push(single);
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }
  return keys;
}

/** Round-robin so a burst of briefings spreads across the configured keys. */
export function rotateKey(keys: string[]): string {
  if (keys.length === 0) throw new Error('No Gemini API keys available');
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

export function createGeminiProvider(): LLMProvider {
  const keys = geminiKeys();
  if (keys.length === 0) {
    throw new ProviderUnconfiguredError(
      'gemini',
      'set GEMINI_API_KEY (or GEMINI_API_KEY_1..8) — https://aistudio.google.com/apikey'
    );
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  return {
    name: 'gemini',
    model,
    async generate({ system, prompt, temperature, maxTokens }: GenerateOptions): Promise<string> {
      const client = new GoogleGenerativeAI(rotateKey(keys));
      const generative = client.getGenerativeModel({
        model,
        systemInstruction: system,
        generationConfig: {
          temperature: temperature ?? 0.4,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
      });
      const result = await generative.generateContent(prompt);
      return result.response.text().trim();
    },

    async *generateStream({ system, prompt, temperature, maxTokens }: GenerateOptions) {
      const client = new GoogleGenerativeAI(rotateKey(keys));
      const generative = client.getGenerativeModel({
        model,
        systemInstruction: system,
        generationConfig: {
          temperature: temperature ?? 0.4,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
      });
      const result = await generative.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const piece = chunk.text();
        if (piece) yield piece;
      }
    },
  };
}
