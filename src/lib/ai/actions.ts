/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Copilot actions
 *
 *  The copilot may propose UI actions by ending its reply with a fenced
 *  ```vantage-actions block. Actions are deliberately limited to read-only
 *  and view-control operations, and nothing runs until the operator clicks
 *  the chip — the model never gets to act on its own.
 *
 *  ponytail: an action block parsed from text, not per-provider native tool
 *  calling — one implementation covers Ollama, Claude and Gemini alike.
 * ═══════════════════════════════════════════════════════════════
 */

export type CopilotAction =
  | { type: 'toggleLayer'; layer: string; label?: string }
  | { type: 'flyTo'; lat: number; lng: number; zoom?: number; label?: string }
  | { type: 'highlight'; layer: string; id: string; label?: string };

/**
 * Layers the copilot may name — these are the real keys of the HUD's
 * `activeLayers` state in `src/app/page.tsx`. Anything else is dropped, so a
 * hallucinated layer name can never reach the toggle.
 */
export const ALLOWED_LAYERS = [
  'flights',
  'private',
  'jets',
  'military',
  'maritime',
  'satellites',
  'cctv',
  'live_news',
  'earthquakes',
  'fires',
  'weather',
  'radiation',
  'infrastructure',
  'global_incidents',
  'war_alerts',
  'malware',
  'cyber_attacks',
  'gdelt_events',
] as const;

const FENCE = /```vantage-actions\s*([\s\S]*?)```/;

export const ACTIONS_PROMPT = `## PROPOSING ACTIONS
When a view change would help the analyst, you MAY end your reply with a single
fenced block:

\`\`\`vantage-actions
[{"type":"toggleLayer","layer":"earthquakes","label":"Show earthquakes"}]
\`\`\`

Rules:
- Only these types: "toggleLayer" (layer), "flyTo" (lat, lng, optional zoom),
  "highlight" (layer, id).
- Only these layers: ${ALLOWED_LAYERS.join(', ')}.
- Use coordinates that appear in the OPERATIONAL DATA. Never invent them.
- At most 3 actions. Omit the block entirely when no view change is useful.
- The block must be the last thing in your reply, and the prose above it must
  stand on its own — the analyst may never click anything.`;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validate one candidate action, returning null when it is not usable. */
function coerce(raw: unknown): CopilotAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const label = typeof a.label === 'string' ? a.label.slice(0, 80) : undefined;

  switch (a.type) {
    case 'toggleLayer': {
      const layer = String(a.layer ?? '');
      if (!(ALLOWED_LAYERS as readonly string[]).includes(layer)) return null;
      return { type: 'toggleLayer', layer, label };
    }
    case 'flyTo': {
      const lat = Number(a.lat);
      const lng = Number(a.lng);
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      const zoom = isFiniteNumber(Number(a.zoom)) ? Math.min(Math.max(Number(a.zoom), 1), 18) : undefined;
      return { type: 'flyTo', lat, lng, ...(zoom ? { zoom } : {}), label };
    }
    case 'highlight': {
      const layer = String(a.layer ?? '');
      const id = String(a.id ?? '');
      if (!(ALLOWED_LAYERS as readonly string[]).includes(layer) || !id) return null;
      return { type: 'highlight', layer, id: id.slice(0, 120), label };
    }
    default:
      return null;
  }
}

export const MAX_ACTIONS = 3;

/**
 * Split a model reply into display prose and validated actions. A malformed
 * or absent block simply yields no actions — the prose is always returned.
 */
export function parseActions(reply: string): { text: string; actions: CopilotAction[] } {
  const match = reply.match(FENCE);
  if (!match) return { text: reply.trim(), actions: [] };

  const text = reply.replace(FENCE, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return { text, actions: [] };
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const actions = list
    .map(coerce)
    .filter((a): a is CopilotAction => a !== null)
    .slice(0, MAX_ACTIONS);

  return { text, actions };
}
