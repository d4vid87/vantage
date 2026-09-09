import type { InvestigationGraph } from './report';
export const DRAFT_KEY = 'vantage-investigation-draft';
export interface InvestigationDraft { id?: string; name: string; notes?: string; graph: InvestigationGraph }

export function parseDraft(raw: string | null): InvestigationDraft | null {
  if (!raw || raw.length > 5_000_000) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d.name !== 'string' || (d.id !== undefined && typeof d.id !== 'string') || (d.notes !== undefined && typeof d.notes !== 'string')) return null;
    if (!Array.isArray(d.graph?.nodes) || !Array.isArray(d.graph?.links)) return null;
    if (!d.graph.nodes.every((n: Record<string, unknown>) => n && typeof n.id === 'string' && typeof n.label === 'string' && typeof n.type === 'string')) return null;
    if (!d.graph.links.every((l: Record<string, unknown>) => l && typeof l.source === 'string' && typeof l.target === 'string')) return null;
    const ids = new Set(d.graph.nodes.map((n: { id: string }) => n.id));
    if (ids.size !== d.graph.nodes.length || !d.graph.links.every((l: { source: string; target: string }) => ids.has(l.source) && ids.has(l.target))) return null;
    return d;
  } catch { return null; }
}
