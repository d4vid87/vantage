import { NextResponse } from 'next/server';
import { db, newId } from '@/lib/db';
import { providerStatus, selectedProvider } from '@/lib/ai/provider';
import { channelStatus } from '@/lib/alerts/dispatch';
import { briefSchedule } from '@/lib/brief';

export const dynamic = 'force-dynamic';
export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  try {
    db().transaction(() => {
      const key = newId('diagnostic');
      db().prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, 'probe');
      db().prepare('DELETE FROM settings WHERE key = ?').run(key);
    })();
    checks.push({ name: 'Database', ok: true, detail: 'SQLite read/write check passed.' });
  } catch { checks.push({ name: 'Database', ok: false, detail: 'SQLite write check failed. Check the data-volume permissions and free space.' }); }
  try {
    const selected = selectedProvider();
    let ok = providerStatus()[selected];
    let detail = ok ? 'Credentials configured; hosted connectivity has not been tested.' : 'Credentials missing.';
    if (selected === 'ollama') {
      const response = await fetch(`${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      const model = process.env.OLLAMA_MODEL || 'llama3.1';
      const normalize = (name: string) => name.includes(':') ? name : `${name}:latest`;
      ok = response.ok && Array.isArray(data.models) && data.models.some((m: { name?: string }) => m.name && normalize(m.name) === normalize(model));
      detail = ok ? 'Ollama is reachable and the configured model is installed.' : 'Ollama answered, but the configured model is unavailable.';
    }
    checks.push({ name: `AI (${selected})`, ok, detail });
  } catch { checks.push({ name: 'AI', ok: false, detail: 'AI configuration or connectivity check failed. Verify the provider and endpoint.' }); }
  for (const [name, ok] of Object.entries(channelStatus())) checks.push({ name: `${name} delivery`, ok, detail: ok ? 'Configured. Use Send test notification in Watchlists to verify delivery.' : 'Not configured (optional).' });
  for (const [name, ok] of [['Finance', !!process.env.FINNHUB_API_KEY], ['AIS vessel feed', !!process.env.AIS_API_KEY], ['ACLED feed', !!(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL)] ] as const) checks.push({ name, ok, detail: ok ? 'Credentials configured.' : 'Credentials absent; this optional feed is unavailable.' });
  let schedule;
  try { schedule = briefSchedule(); if (schedule.error) checks.push({ name: 'Brief schedule', ok: false, detail: schedule.error }); } catch { checks.push({ name: 'Brief timezone', ok: false, detail: 'Invalid VANTAGE_BRIEF_TIMEZONE. Use an IANA timezone such as America/Chicago.' }); }
  return NextResponse.json({ checks, schedule });
}
