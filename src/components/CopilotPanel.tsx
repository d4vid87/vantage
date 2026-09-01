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
import { Bot, Send, X, Loader2, AlertTriangle, Cpu } from 'lucide-react';

export interface CopilotContext {
  earthquakes: unknown[];
  news: unknown[];
  threats: unknown[];
  cyberAlerts: unknown[];
  timestamp: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Builds the live grounding context at send time, not render time. */
  getContext: () => CopilotContext;
}

const SUGGESTIONS = [
  'What is the most significant development on screen right now?',
  'Correlate the seismic and news feeds — anything clustering?',
  'Which cyber alerts warrant action today?',
];

export default function CopilotPanel({ open, onClose, getContext }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
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
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const next: Turn[] = [...turns, { role: 'user', content: question }];
      setTurns(next);
      setInput('');
      setBusy(true);
      setError(null);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, context: getContext() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Copilot failed (${res.status})`);
          return;
        }
        if (data.provider) setProvider(data.provider);
        setTurns([...next, { role: 'assistant', content: data.answer }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Copilot request failed.');
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, getContext]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
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
              <div
                key={i}
                className="whitespace-pre-wrap rounded px-2 py-1.5"
                style={{
                  background: t.role === 'user' ? 'var(--bg-tertiary)' : 'transparent',
                  borderLeft: t.role === 'assistant' ? '2px solid var(--cyan-primary)' : undefined,
                }}
              >
                {t.content}
              </div>
            ))}

            {busy && (
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-2"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <input
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
