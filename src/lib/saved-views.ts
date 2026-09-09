/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — saved views
 *
 *  A view is a named bookmark of the operator's working picture: which layers
 *  are on and where the camera sits. localStorage-backed — views are personal
 *  to a browser, exactly like the drawn-shape store next to it.
 * ═══════════════════════════════════════════════════════════════
 */

export interface SavedView {
  name: string;
  layers: string[];      // keys that are ON
  lat: number;
  lng: number;
  zoom: number;
  savedAt: number;
}

export const VIEWS_KEY = 'vantage-saved-views';
const MAX_VIEWS = 24;

export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((v): v is SavedView =>
      !!v && typeof v.name === 'string' && !!v.name.trim() && v.name.length <= 120 && Array.isArray(v.layers) && v.layers.every((k: unknown) => typeof k === 'string')
      && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 && Number.isFinite(v.lng) && Number.isFinite(v.zoom) && v.zoom >= 0 && v.zoom <= 24
    ).slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

/** Add or replace by name (case-insensitive), newest first. */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const rest = views.filter(v => v.name.toLowerCase() !== view.name.toLowerCase());
  return [view, ...rest].slice(0, MAX_VIEWS);
}

export function removeView(views: SavedView[], name: string): SavedView[] {
  return views.filter(v => v.name !== name);
}

/** Reject an invalid import as a whole so it never silently replaces valid views. */
export function importViews(raw: string, existing: SavedView[]): SavedView[] {
  if (raw.length > 1_000_000) throw new Error('View file is too large.');
  const list: unknown = JSON.parse(raw);
  if (!Array.isArray(list) || list.length > MAX_VIEWS || parseViews(raw).length !== list.length) throw new Error('Expected up to 24 valid saved views.');
  return parseViews(raw).reduce((views, view) => upsertView(views, view), existing);
}
