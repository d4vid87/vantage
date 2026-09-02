/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — anomaly detection
 *
 *  A layer count that doubles its trailing baseline is worth an alert: a
 *  quake swarm, an outage cluster, a ransomware burst. Pure math here; the
 *  scheduler owns storage and dispatch.
 * ═══════════════════════════════════════════════════════════════
 */

/** Ticks before a layer has a baseline — 30 × 120s ≈ an hour of history. */
export const MIN_SAMPLES = 30;
/** Spike must at least double the baseline… */
export const SPIKE_RATIO = 2;
/** …and grow by this many items, so 2→5 on a quiet layer stays quiet. */
export const MIN_DELTA = 10;
/** One anomaly alert per layer per window — a sustained spike is one event. */
export const COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface AnomalyVerdict {
  anomalous: boolean;
  mean: number;
  ratio: number;
}

export function detectAnomaly(history: number[], current: number): AnomalyVerdict {
  if (history.length < MIN_SAMPLES) return { anomalous: false, mean: 0, ratio: 0 };
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const ratio = mean > 0 ? current / mean : current > 0 ? Infinity : 0;
  const anomalous = current >= mean * SPIKE_RATIO && current - mean >= MIN_DELTA;
  return { anomalous, mean, ratio };
}
