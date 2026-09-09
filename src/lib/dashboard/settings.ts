import { db } from "../db";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  type DashboardSettings,
} from "./types";
const KEY = "dashboard-v1";
export function dashboardSettings(): DashboardSettings {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(KEY) as
    | {
        value: string;
      }
    | undefined;
  return row
    ? validateSettings(JSON.parse(row.value))
    : structuredClone(DEFAULT_SETTINGS);
}
export function saveDashboardSettings(raw: unknown): DashboardSettings {
  const next = validateSettings(raw);
  return db().transaction(() => {
    const current = dashboardSettings();
    if (current.revision !== next.revision)
      throw new Error(
        "Settings changed on another device. Reload before saving.",
      );
    const armed = db()
      .prepare(
        "SELECT spec FROM watch_rules WHERE enabled = 1 AND kind = 'market'",
      )
      .all() as { spec: string }[];
    const symbols = new Set(next.symbols);
    for (const rule of armed) {
      try {
        const spec = JSON.parse(rule.spec);
        if (typeof spec.symbol === "string") symbols.add(spec.symbol);
      } catch {
        /* Invalid legacy watches are isolated by the evaluator. */
      }
    }
    if (symbols.size > 20)
      throw new Error(
        "Watchlist and armed rules can cover at most 20 symbols combined.",
      );
    next.revision++;
    db()
      .prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(KEY, JSON.stringify(next));
    return next;
  })();
}
