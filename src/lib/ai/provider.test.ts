import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getProvider, ProviderUnconfiguredError, providerStatus, selectedProvider } from './provider';

const ENV_KEYS = [
  'VANTAGE_AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_1',
  'OLLAMA_URL',
  'OLLAMA_MODEL',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe('selectedProvider', () => {
  it('defaults to the local-first Ollama brain', () => {
    expect(selectedProvider()).toBe('ollama');
  });

  it('accepts the three supported providers case-insensitively', () => {
    for (const name of ['ollama', 'Claude', 'GEMINI']) {
      process.env.VANTAGE_AI_PROVIDER = name;
      expect(selectedProvider()).toBe(name.toLowerCase());
    }
  });

  it('rejects an unknown provider rather than silently falling back', () => {
    process.env.VANTAGE_AI_PROVIDER = 'gpt';
    expect(() => selectedProvider()).toThrow(ProviderUnconfiguredError);
  });
});

describe('getProvider', () => {
  it('throws ProviderUnconfiguredError for Claude without a key', async () => {
    await expect(getProvider('claude')).rejects.toBeInstanceOf(ProviderUnconfiguredError);
  });

  it('throws ProviderUnconfiguredError for Gemini without a key', async () => {
    await expect(getProvider('gemini')).rejects.toBeInstanceOf(ProviderUnconfiguredError);
  });

  it('builds a Claude provider once the key is present', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const provider = await getProvider('claude');
    expect(provider.name).toBe('claude');
    expect(provider.model).toContain('claude');
  });

  it('honours an explicit Ollama model override', async () => {
    process.env.OLLAMA_MODEL = 'mistral';
    const provider = await getProvider('ollama');
    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('mistral');
  });
});

describe('ollama adapter', () => {
  it('returns the assistant message content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: { content: '  BLUF: quiet.  ' } })))
    );
    const provider = await getProvider('ollama');
    await expect(provider.generate({ system: 's', prompt: 'p' })).resolves.toBe('BLUF: quiet.');
  });

  it('reports an unreachable daemon as a configuration problem, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const provider = await getProvider('ollama');
    await expect(provider.generate({ system: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ProviderUnconfiguredError
    );
  });

  it('tells the operator to pull the model on a 404', async () => {
    process.env.OLLAMA_MODEL = 'llama3.1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const provider = await getProvider('ollama');
    await expect(provider.generate({ system: 's', prompt: 'p' })).rejects.toThrow(/ollama pull llama3.1/);
  });
});

describe('claude adapter', () => {
  it('concatenates text blocks from the Messages API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'Part one. ' }, { type: 'text', text: 'Part two.' }] })
        );
      })
    );
    const provider = await getProvider('claude');
    await expect(provider.generate({ system: 'sys', prompt: 'ask' })).resolves.toBe(
      'Part one. Part two.'
    );
    expect((calls[0].headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    expect(JSON.parse(String(calls[0].body)).system).toBe('sys');
  });

  it('surfaces an API error message', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'bad model' } }), {
          status: 400,
        })
      )
    );
    const provider = await getProvider('claude');
    await expect(provider.generate({ system: 's', prompt: 'p' })).rejects.toThrow(/bad model/);
  });
});

describe('providerStatus', () => {
  it('reports hosted providers as unconfigured on a bare instance', () => {
    const status = providerStatus();
    expect(status.claude).toBe(false);
    expect(status.gemini).toBe(false);
    expect(status.ollama).toBe(true);
  });

  it('detects rotated Gemini keys', () => {
    process.env.GEMINI_API_KEY_1 = 'g-test';
    expect(providerStatus().gemini).toBe(true);
  });
});
