/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — brief-to-brief diff
 *
 *  "What changed since yesterday" beats "what exists today". Each brief run
 *  stores a compact summary of what it saw; the next run diffs against it and
 *  appends a deterministic changes section — deterministic because the model
 *  paraphrasing away a new outbreak is exactly the failure this exists to
 *  prevent.
 * ═══════════════════════════════════════════════════════════════
 */

export interface BriefSnapshot {
  /** layer → stable item identities (id, else title/name), capped. */
  ids: Record<string, string[]>;
  counts: Record<string, number>;
  takenAt: string;
}

/**
 * Layers where an individual NEW item is report-worthy. Fast-churn layers
 * (flights, air quality) would list pure noise — they only get count deltas.
 */
const NOTABLE_LAYERS = new Set(['disease', 'volcanoes', 'ransomware', 'conflicts', 'power_outages', 'acled']);
const MAX_IDS = 300;
const MAX_NAMED = 5;

/** Count moves under both gates are jitter, not news. */
const COUNT_RATIO = 1.25;
const COUNT_DELTA = 10;

function identity(r: unknown): string {
  const t = r as Record<string, unknown>;
  const v = t.id ?? t.title ?? t.name ?? t.victim ?? t.utility ?? t.disease;
  return v == null ? '' : String(v);
}

export function summarizeSnapshot(snapshot: Record<string, unknown[]>, takenAt = new Date().toISOString()): BriefSnapshot {
  const ids: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  for (const [layer, records] of Object.entries(snapshot)) {
    if (!Array.isArray(records)) continue;
    counts[layer] = records.length;
    if (NOTABLE_LAYERS.has(layer)) {
      ids[layer] = records.map(identity).filter(Boolean).slice(0, MAX_IDS);
    }
  }
  return { ids, counts, takenAt };
}

/** Human-readable change lines; empty when nothing moved (or no previous run). */
export function diffSnapshots(prev: BriefSnapshot | null, curr: BriefSnapshot): string[] {
  if (!prev) return [];
  const lines: string[] = [];

  for (const [layer, currIds] of Object.entries(curr.ids)) {
    const seen = new Set(prev.ids[layer] ?? []);
    if (seen.size === 0 && !(layer in prev.ids)) continue; // layer is new to the diff, not to the world
    const fresh = currIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) continue;
    const named = fresh.slice(0, MAX_NAMED).join('; ');
    const more = fresh.length > MAX_NAMED ? ` (+${fresh.length - MAX_NAMED} more)` : '';
    lines.push(`${fresh.length} new ${layer.replace(/_/g, ' ')}: ${named}${more}`);
  }

  for (const [layer, count] of Object.entries(curr.counts)) {
    const before = prev.counts[layer];
    if (typeof before !== 'number' || before === 0) continue;
    const ratio = count / before;
    const delta = Math.abs(count - before);
    if ((ratio >= COUNT_RATIO || ratio <= 1 / COUNT_RATIO) && delta >= COUNT_DELTA) {
      const pct = Math.round((ratio - 1) * 100);
      lines.push(`${layer.replace(/_/g, ' ')} count ${before} → ${count} (${pct > 0 ? '+' : ''}${pct}%)`);
    }
  }

  return lines;
}

/** The markdown section appended to a brief; empty string when quiet. */
export function changesSection(lines: string[]): string {
  if (lines.length === 0) return '';
  return `\n\n## Changes since last brief\n${lines.map((l) => `- ${l}`).join('\n')}`;
}
