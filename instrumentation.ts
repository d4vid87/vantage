/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Server bootstrap
 *
 *  Next.js calls register() once per server process. Vantage uses it to start
 *  the watchlist evaluator, so alerts fire whether or not anyone has the UI
 *  open — the whole point of persisting rules server-side.
 *
 *  Disable with VANTAGE_SCHEDULER=off.
 * ═══════════════════════════════════════════════════════════════
 */

const DEFAULT_INTERVAL_MS = 120_000;
const MIN_INTERVAL_MS = 5_000;

export async function register() {
  // Only the Node runtime can reach SQLite; the edge/browser bundles must not
  // try to schedule anything.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if ((process.env.VANTAGE_SCHEDULER || '').trim().toLowerCase() === 'off') return;

  const raw = Number(process.env.VANTAGE_ALERT_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const interval = Number.isFinite(raw) ? Math.max(raw, MIN_INTERVAL_MS) : DEFAULT_INTERVAL_MS;

  const { collectSnapshot, runEvaluation } = await import('./src/lib/alerts/run');
  const { listRules } = await import('./src/lib/alerts/store');

  let running = false;

  const tick = async () => {
    // A slow feed must not let two evaluations overlap and double-dispatch.
    if (running) return;
    running = true;
    try {
      // Cheap guard: with no rules configured there is nothing to fetch for.
      if (listRules().length === 0) return;
      const snapshot = await collectSnapshot();
      if (Object.keys(snapshot).length === 0) return;
      const fired = await runEvaluation(snapshot);
      if (fired.length > 0) {
        console.log(`[VANTAGE] scheduler dispatched ${fired.length} alert(s)`);
      }
    } catch (err) {
      console.error('[VANTAGE] scheduler tick failed:', err);
    } finally {
      running = false;
    }
  };

  // ponytail: one scheduler per process. Gate to a leader if this is ever
  // scaled to more than one replica.
  const timer = setInterval(tick, interval);
  // Do not hold the process open on shutdown.
  if (typeof timer.unref === 'function') timer.unref();

  console.log(`[VANTAGE] watchlist scheduler active — every ${Math.round(interval / 1000)}s`);
}
