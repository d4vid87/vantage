import { cachedSource } from "../sourceCache";
import { type Feed } from "./types";
/** Reuse the shared bounded cache; a single envelope allows a successful empty dataset. */
export async function feed<T>(
  key: string,
  provider: string,
  ttl: number,
  read: () => Promise<T>,
): Promise<Feed<T>> {
  let failure = "";
  const rows = await cachedSource<Feed<T>>(
    "dashboard:" + key,
    async () => {
      try {
        const data = await read();
        const now = new Date().toISOString();
        return [
          {
            data,
            provider,
            sourceTime: null,
            receivedAt: now,
            status: "ready",
          },
        ];
      } catch (e) {
        failure = e instanceof Error ? e.message : "Source failed";
        throw new Error(failure);
      }
    },
    ttl,
  )();
  const value = rows[0];
  if (!value)
    return {
      data: null,
      provider,
      sourceTime: null,
      receivedAt: null,
      status: "unavailable",
      error: failure || "Source unavailable; retry shortly.",
    };
  const stale = !!failure || Date.now() - Date.parse(value.receivedAt!) > ttl;
  return {
    ...value,
    status: stale ? "stale" : "ready",
    ...(stale
      ? {
          error: failure || "Refresh overdue; showing last received data.",
        }
      : {}),
  };
}
export async function json(
  url: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Vantage personal dashboard (https://github.com/d4vid87/vantage)",
      Accept: "application/geo+json, application/json",
      ...headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Provider HTTP ${r.status}`);
  return r.json();
}
