/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Pluggable LLM provider
 *
 *  Vantage is local-first: the default brain is Ollama running on your own
 *  GPU, so no intelligence context ever leaves the machine. Claude and Gemini
 *  are available for teams that want a hosted model instead.
 *
 *  Select with VANTAGE_AI_PROVIDER = ollama | claude | gemini
 * ═══════════════════════════════════════════════════════════════
 */

export type ProviderName = 'ollama' | 'claude' | 'gemini';

export interface GenerateOptions {
  /** System / persona instruction. */
  system: string;
  /** The fully-rendered user prompt. */
  prompt: string;
  /** Upper bound on response length. */
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly name: ProviderName;
  /** Human-readable model identifier, for display in the HUD. */
  readonly model: string;
  generate(opts: GenerateOptions): Promise<string>;
}

/** Thrown when the selected provider has no usable configuration. */
export class ProviderUnconfiguredError extends Error {
  readonly provider: ProviderName;
  constructor(provider: ProviderName, detail: string) {
    super(`AI provider "${provider}" is not configured: ${detail}`);
    this.name = 'ProviderUnconfiguredError';
    this.provider = provider;
  }
}

export function selectedProvider(): ProviderName {
  const raw = (process.env.VANTAGE_AI_PROVIDER || 'ollama').trim().toLowerCase();
  if (raw === 'ollama' || raw === 'claude' || raw === 'gemini') return raw;
  throw new ProviderUnconfiguredError(
    'ollama',
    `unknown VANTAGE_AI_PROVIDER "${raw}" — expected ollama, claude or gemini`
  );
}

/**
 * Build the configured provider. Throws ProviderUnconfiguredError when the
 * selection is missing its credentials, which callers surface as a 503 so the
 * rest of the platform keeps working without any AI setup at all.
 */
export async function getProvider(name?: ProviderName): Promise<LLMProvider> {
  const chosen = name ?? selectedProvider();
  switch (chosen) {
    case 'ollama': {
      const { createOllamaProvider } = await import('./ollama');
      return createOllamaProvider();
    }
    case 'claude': {
      const { createClaudeProvider } = await import('./claude');
      return createClaudeProvider();
    }
    case 'gemini': {
      const { createGeminiProvider } = await import('./gemini');
      return createGeminiProvider();
    }
  }
}

/** Report which providers look configured, for the HUD / probe endpoints. */
export function providerStatus(): Record<ProviderName, boolean> {
  return {
    ollama: true, // always reachable in principle; the URL has a working default
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(
      process.env.GEMINI_API_KEY ||
        Array.from({ length: 8 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 1}`]).some(Boolean)
    ),
  };
}
