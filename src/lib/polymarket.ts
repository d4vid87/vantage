/**
 * VANTAGE — prediction-market signals (Polymarket).
 *
 * Market odds are a crowd-sourced early-warning signal: money moves on a
 * conflict or election before reporting catches up. Read-only, public odds.
 *
 * The Gamma API returns `outcomes` and `outcomePrices` as JSON-encoded strings
 * inside the JSON, so both need a second parse.
 */

export interface MarketSignal {
  id: string;
  question: string;
  slug: string;
  url: string;
  probability: number | null;
  volume: number;
  endDate: string;
  topics: string[];
}

/** Markets worth surfacing on a situational-awareness board. */
export const GEO_KEYWORDS: Record<string, RegExp> = {
  conflict: /\b(war|invade|invasion|ceasefire|strike|military|troops|nuclear|missile)\b/i,
  election: /\b(election|president|prime minister|electe?d?|vote|chancellor)\b/i,
  sanctions: /\b(sanction|embargo|tariff|trade war)\b/i,
  geopolitics: /\b(nato|un |united nations|treaty|annex|coup|regime)\b/i,
};

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/**
 * The "Yes" price is the market's implied probability. Polymarket orders
 * outcomes alongside their prices, so "Yes" is located rather than assumed.
 */
export function yesProbability(outcomes: unknown, prices: unknown): number | null {
  const o = parseMaybeJson(outcomes);
  const p = parseMaybeJson(prices);
  if (!Array.isArray(o) || !Array.isArray(p) || o.length !== p.length) return null;
  const i = o.findIndex((x) => String(x).toLowerCase() === 'yes');
  if (i < 0) return null;
  const n = Number(p[i]);
  return Number.isFinite(n) ? n : null;
}

export function topicsFor(question: string): string[] {
  return Object.entries(GEO_KEYWORDS).filter(([, re]) => re.test(question)).map(([k]) => k);
}

interface RawMarket {
  id?: string | number;
  question?: string;
  slug?: string;
  outcomes?: unknown;
  outcomePrices?: unknown;
  volumeNum?: string | number;
  endDate?: string;
}

export function mapMarkets(raw: RawMarket[] | null | undefined, limit = 25): MarketSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketSignal[] = [];

  for (const m of raw) {
    const question = (m?.question || '').trim();
    if (!question) continue;
    const topics = topicsFor(question);
    if (topics.length === 0) continue; // not a geopolitical signal

    out.push({
      id: String(m.id ?? m.slug ?? question.slice(0, 40)),
      question,
      slug: m.slug || '',
      url: m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com',
      probability: yesProbability(m.outcomes, m.outcomePrices),
      volume: Number(m.volumeNum ?? 0) || 0,
      endDate: m.endDate || '',
      topics,
    });
  }

  return out.sort((a, b) => b.volume - a.volume).slice(0, limit);
}
