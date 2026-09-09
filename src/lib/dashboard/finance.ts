import { feed } from "./remote";
import {
  asRecord,
  finite,
  symbolOf,
  type PersonalQuote,
  type QuoteFeed,
} from "./types";
let requests: number[] = [];
let blockedUntil = 0;
// ponytail: per-process budget; use a shared limiter if deploying multiple replicas.
async function finnhub(path: string, params: Record<string, string> = {}) {
  if (!process.env.FINNHUB_API_KEY)
    throw new Error("Configure FINNHUB_API_KEY on the server.");
  const now = Date.now();
  requests = requests.filter((t) => now - t < 60_000);
  if (now < blockedUntil || requests.length >= 40)
    throw new Error("Free provider budget reached; retry next minute.");
  requests.push(now);
  const u = new URL("https://finnhub.io/api/v1/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, {
    headers: {
      "X-Finnhub-Token": process.env.FINNHUB_API_KEY,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (r.status === 429) {
    blockedUntil =
      now + Math.max(60, Number(r.headers.get("retry-after")) || 60) * 1000;
    throw new Error("Provider rate limit; retry later.");
  }
  if (!r.ok)
    throw new Error(
      `Finnhub HTTP ${r.status}; endpoint may be unavailable on your plan.`,
    );
  const data: unknown = await r.json();
  if (asRecord(data).error)
    throw new Error("Finnhub could not serve this request.");
  return data;
}
export function normalizeQuote(
  raw: unknown,
  symbol: string,
  open: boolean,
): PersonalQuote {
  const q = asRecord(raw);
  if (
    !finite(q.c) ||
    q.c <= 0 ||
    !finite(q.pc) ||
    q.pc <= 0 ||
    !finite(q.t) ||
    q.t <= 0
  )
    throw new Error("No valid quote for this symbol.");
  return {
    symbol,
    price: q.c,
    changePercent: ((q.c - q.pc) / q.pc) * 100,
    sourceTime: new Date(q.t * 1000).toISOString(),
    marketOpen: open,
    delay: "unknown",
    currency: "USD",
  };
}
async function marketOpen() {
  const s = await feed("market-session", "Finnhub", 60_000, () =>
    finnhub("stock/market-status", {
      exchange: "US",
    }),
  );
  return s.status === "ready" && asRecord(s.data).isOpen === true;
}
export async function quotes(symbols: string[]): Promise<QuoteFeed[]> {
  if (!process.env.FINNHUB_API_KEY)
    return symbols.map((symbol) => ({
      symbol,
      data: null,
      provider: "Finnhub",
      receivedAt: null,
      sourceTime: null,
      status: "unconfigured",
      error: "Configure FINNHUB_API_KEY.",
    }));
  const open = await marketOpen();
  const out: QuoteFeed[] = [];
  for (const raw of [...new Set(symbols)].slice(0, 20)) {
    const symbol = symbolOf(raw);
    const q = await feed("quote:" + symbol, "Finnhub", 60_000, async () =>
      normalizeQuote(
        await finnhub("quote", {
          symbol,
        }),
        symbol,
        open,
      ),
    );
    out.push({
      ...q,
      symbol,
      sourceTime: q.data?.sourceTime ?? null,
      data: q.data
        ? {
            ...q.data,
            marketOpen: open,
          }
        : null,
    });
  }
  return out;
}
export async function company(symbol: string) {
  symbol = symbolOf(symbol);
  const [profile, metrics, earnings] = await Promise.all([
    feed("profile:" + symbol, "Finnhub", 86400000, () =>
      finnhub("stock/profile2", {
        symbol,
      }),
    ),
    feed("metric:" + symbol, "Finnhub", 86400000, () =>
      finnhub("stock/metric", {
        symbol,
        metric: "all",
      }),
    ),
    feed("earnings:" + symbol, "Finnhub", 86400000, () =>
      finnhub("calendar/earnings", {
        symbol,
        from: new Date().toISOString().slice(0, 10),
        to: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10),
      }),
    ),
  ]);
  return {
    profile,
    metrics,
    earnings,
  };
}
export async function news(symbol?: string) {
  const params: Record<string, string> = symbol
    ? {
        symbol: symbolOf(symbol),
        from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      }
    : {
        category: "general",
      };
  return feed("news:" + (symbol || "general"), "Finnhub", 900000, () =>
    finnhub(symbol ? "company-news" : "news", params),
  );
}
export async function lookup(query: string) {
  if (query.length < 1 || query.length > 60)
    throw new Error("Search must contain 1–60 characters.");
  return feed("symbol:" + query, "Finnhub", 3600000, () =>
    finnhub("search", {
      q: query,
    }),
  );
}
