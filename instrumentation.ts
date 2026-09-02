/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Server bootstrap
 *
 *  Next.js calls register() once per server process. Vantage uses it to start
 *  the watchlist evaluator, so alerts fire whether or not anyone has the UI
 *  open — the whole point of persisting rules server-side.
 *
 *  It also drives the scheduled daily brief, which is off unless
 *  VANTAGE_DAILY_BRIEF is set to a local HH:MM.
 *
 *  Disable both with VANTAGE_SCHEDULER=off.
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

  const { collectSnapshot, runEvaluation, runAnomalyCheck, lastLayerCounts } =
    await import('./src/lib/alerts/run');
  const { listRules } = await import('./src/lib/alerts/store');

  // Spike detection needs no rules — it baselines every alert-eligible layer.
  const anomalyOn = (process.env.VANTAGE_ANOMALY || 'on').trim().toLowerCase() !== 'off';

  let running = false;

  const tick = async () => {
    // A slow feed must not let two evaluations overlap and double-dispatch.
    if (running) return;
    running = true;
    try {
      // Cheap guard: nothing wants the snapshot this tick.
      if (listRules().length === 0 && !anomalyOn) return;
      const snapshot = await collectSnapshot();
      if (anomalyOn) {
        const spikes = await runAnomalyCheck(lastLayerCounts());
        if (spikes > 0) console.log(`[VANTAGE] anomaly check fired ${spikes} alert(s)`);
      }
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

  // ── Daily retention prune — machine-generated history only ──
  const { pruneOldData, retentionDays } = await import('./src/lib/retention');
  const prune = () => {
    try {
      const r = pruneOldData();
      const total = r.alerts + r.briefs + r.reconAudit + r.watchState;
      if (total > 0) console.log(`[VANTAGE] retention prune (${retentionDays()}d):`, r);
    } catch (err) {
      console.error('[VANTAGE] retention prune failed:', err);
    }
  };
  prune();
  const pruneTimer = setInterval(prune, 24 * 60 * 60 * 1000);
  if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

  // ── Scheduled daily brief ──
  const briefAt = (process.env.VANTAGE_DAILY_BRIEF || '').trim();
  if (!briefAt) return;

  const { generateDailyBrief, shouldRunBrief, getSetting, setSetting, BRIEF_LAST_RUN_KEY } =
    await import('./src/lib/brief');

  let briefing = false;
  const briefTick = async () => {
    if (briefing) return;
    try {
      if (!shouldRunBrief(new Date(), briefAt, getSetting(BRIEF_LAST_RUN_KEY))) return;
      briefing = true;
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      // Claim the day before generating: a slow model must not let a second
      // tick start a duplicate brief.
      setSetting(BRIEF_LAST_RUN_KEY, today);
      const { brief, delivered } = await generateDailyBrief();
      console.log(`[VANTAGE] daily brief ${brief.id} generated; delivery:`, delivered);
    } catch (err) {
      console.error('[VANTAGE] daily brief failed:', err);
    } finally {
      briefing = false;
    }
  };

  const briefTimer = setInterval(briefTick, 60_000);
  if (typeof briefTimer.unref === 'function') briefTimer.unref();
  console.log(`[VANTAGE] daily brief scheduled for ${briefAt} local time`);
}
