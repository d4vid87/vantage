'use client';

/**
 * VANTAGE — AI Analyst Copilot
 *
 * A chat docked into the HUD that is grounded in whatever is currently on the
 * map: the live layer data is sent along with every turn, so answers cite real
 * records instead of the model's priors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, Loader2, AlertTriangle, Cpu, Layers, Crosshair, MapPin } from 'lucide-react';
import { usePanel } from '@/hooks/usePanel';
import type { CopilotAction } from '@/lib/ai/actions';

export interface CopilotContext {
  earthquakes: unknown[];
  news: unknown[];
  threats: unknown[];
  cyberAlerts: unknown[];
  timestamp: string;
  scope?: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  actions?: CopilotAction[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Builds the live grounding context at send time, not render time. */
  getContext: () => CopilotContext;
  /** Runs a copilot-proposed action. Only ever called from a click. */
  onAction?: (action: CopilotAction) => void;
}

const ACTION_ICON = {
  toggleLayer: Layers,
  flyTo: MapPin,
  highlight: Crosshair,
} as const;

function actionLabel(a: CopilotAction): string {
  if (a.label) return a.label;
  if (a.type === 'toggleLayer') return `Toggle ${a.layer}`;
  if (a.type === 'flyTo') return `Fly to ${a.lat.toFixed(2)}, ${a.lng.toFixed(2)}`;
  return `Highlight ${a.id}`;
}

const SUGGESTIONS = [
  'What is the most significant development on screen right now?',
  'Correlate the seismic and news feeds — anything clustering?',
  'Which cyber alerts warrant action today?',
];

export default function CopilotPanel({ open, onClose, getContext, onAction }: Props) {
  const panel = usePanel<HTMLElement>(open, onClose);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { if (!open) request.current?.abort(); }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/ai/chat')
      .then((r) => r.json())
      .then((d) => setProvider(d.selected ?? null))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, streaming]);

  const send = useCallback(
    async (text: string, retry = false) => {
      const question = text.trim();
      if (!question || busy || request.current) return;

      const history = retry && turns.at(-1)?.role === 'user' ? turns.slice(0, -1) : turns;
      const next: Turn[] = [...history, { role: 'user', content: question }];
      const controller = new AbortController();
      request.current = controller;
      let shown = '';
      setTurns(next);
      setInput('');
      setBusy(true);
      setStreaming('');
      setError(null);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, context: getContext() }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Copilot failed (${res.status})`);
          return;
        }

        // NDJSON: {delta} frames while generating, one {done} frame at the end.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;

        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            let frame: {
              delta?: string;
              done?: boolean;
              answer?: string;
              actions?: CopilotAction[];
              provider?: string;
              error?: string;
            };
            try {
              frame = JSON.parse(line);
            } catch {
              continue;
            }

            if (frame.error) {
              setError(frame.error);
              finished = true;
              break;
            }
            if (frame.delta) {
              shown += frame.delta;
              setStreaming(shown);
            }
            if (frame.done) {
              if (frame.provider) setProvider(frame.provider);
              setTurns([
                ...next,
                { role: 'assistant', content: frame.answer ?? shown, actions: frame.actions ?? [] },
              ]);
              setStreaming('');
              finished = true;
            }
          }
        }

        // Stream cut off before the final frame — keep what was rendered.
        if (!finished && shown) {
          setTurns([...next, { role: 'assistant', content: shown }]);
          setStreaming('');
        }
      } catch (err) {
        if (shown) { setTurns([...next, { role: 'assistant', content: shown }]); setStreaming(''); }
        setError(controller.signal.aborted ? 'Generation stopped.' : err instanceof Error ? err.message : 'Copilot request failed.');
      } finally {
        request.current = null;
        setBusy(false);
      }
    },
    [busy, turns, getContext]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.aside ref={panel} role="dialog"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.18 }}
          className="fixed right-3 bottom-3 z-[900] flex h-[70vh] w-[min(420px,calc(100vw-1.5rem))] flex-col rounded-lg border"
          style={{
            background: 'var(--bg-panel-solid)',
            borderColor: 'var(--border-cyan)',
            color: 'var(--text-primary)',
          }}
          aria-label="AI analyst copilot"
        >
          <header
            className="flex items-center gap-2 border-b px-3 py-2 text-[11px] font-bold tracking-wider"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Bot size={14} style={{ color: 'var(--cyan-primary)' }} />
            <span>ANALYST COPILOT</span>
            {provider && (
              <span
                className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-normal uppercase"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--gold-primary)' }}
              >
                <Cpu size={9} /> {provider}
              </span>
            )}
            <button
              onClick={onClose}
              className="ml-auto opacity-70 hover:opacity-100"
              aria-label="Close copilot"
            >
              <X size={14} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-[12px] leading-relaxed">
            {turns.length === 0 && !busy && (
              <div className="space-y-2">
                <p className="opacity-60">
                  Grounded in the layers currently loaded. Ask about what is on screen.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded border px-2 py-1.5 text-left text-[11px] opacity-80 hover:opacity-100"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i}>
                <div
                  className="whitespace-pre-wrap rounded px-2 py-1.5"
                  style={{
                    background: t.role === 'user' ? 'var(--bg-tertiary)' : 'transparent',
                    borderLeft: t.role === 'assistant' ? '2px solid var(--cyan-primary)' : undefined,
                  }}
                >
                  {t.content}
                </div>

                {t.role === 'assistant' && <button className="text-[11px] opacity-70" onClick={() => navigator.clipboard.writeText(t.content).catch(() => setError('Copy unavailable. Select the answer text to copy it.'))}>Copy answer</button>}
                {/* Proposed actions never run on their own — one click each. */}
                {t.actions && t.actions.length > 0 && onAction && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-2">
                    {t.actions.map((a, j) => {
                      const Icon = ACTION_ICON[a.type];
                      return (
                        <button
                          key={j}
                          onClick={() => onAction(a)}
                          className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold"
                          style={{ background: 'var(--bg-tertiary)', color: 'var(--cyan-primary)' }}
                        >
                          <Icon size={9} /> {actionLabel(a)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {streaming && (
              <div
                className="whitespace-pre-wrap rounded px-2 py-1.5"
                style={{ borderLeft: '2px solid var(--cyan-primary)' }}
              >
                {streaming}
              </div>
            )}

            {busy && !streaming && (
              <div className="flex items-center gap-2 opacity-70">
                <Loader2 size={12} className="animate-spin" /> Analysing…
              </div>
            )}

            {error && (
              <div
                className="flex items-start gap-2 rounded px-2 py-1.5 text-[11px]"
                style={{ background: 'rgba(255,59,48,.12)', color: '#ff6b6b' }}
              >
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="px-3 flex gap-3 text-[12px]">
            {busy && <button onClick={() => request.current?.abort()}>Stop generation</button>}
            {!busy && error && <button onClick={() => { const last = [...turns].reverse().find(t => t.role === 'user'); if (last) void send(last.content, true); }}>Retry last question</button>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-2"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <input
              aria-label="Ask the analyst"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the analyst…"
              disabled={busy}
              className="flex-1 rounded bg-transparent px-2 py-1.5 text-[12px] outline-none"
              style={{ border: '1px solid var(--border-primary)' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded p-1.5 disabled:opacity-40"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--cyan-primary)' }}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
