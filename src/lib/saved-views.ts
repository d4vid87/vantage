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
      !!v && typeof v.name === 'string' && Array.isArray(v.layers)
      && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)
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
