'use client';

/**
 * VANTAGE — Link-analysis investigations
 *
 * Seed a graph from any entity, expand nodes against the intel layer, save the
 * result server-side, and export it as a dossier. This is the "who connects to
 * what" surface that turns a live map into a recorded investigation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, X, Save, FileDown, Plus, Loader2, AlertTriangle, FolderOpen } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  sanctioned?: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  label?: string;
}

interface Investigation {
  id: string;
  name: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional entity to seed the graph with when the panel opens. */
  seed?: { id: string; label: string; type: string } | null;
}

const EXPANDABLE = new Set(['aircraft', 'vessel', 'company', 'person', 'ip', 'country']);

const TYPE_COLOR: Record<string, string> = {
  aircraft: '#00e5ff',
  vessel: '#4ade80',
  company: '#fbbf24',
  person: '#f472b6',
  ip: '#a78bfa',
  country: '#94a3b8',
  wallet: '#f59e0b',
  domain: '#38bdf8',
};

export default function InvestigationGraph({ open, onClose, seed }: Props) {
  const [name, setName] = useState('Untitled Investigation');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [saved, setSaved] = useState<Investigation[]>([]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newEntity, setNewEntity] = useState('');
  const [newType, setNewType] = useState('company');
  const [removedSeed, setRemovedSeed] = useState(false);

  // The seed entity is derived rather than pushed into state by an effect, so
  // reopening the panel can never duplicate it.
  const allNodes = useMemo(() => {
    if (!seed || removedSeed || nodes.some((n) => n.id === seed.id)) return nodes;
    return [{ ...seed }, ...nodes];
  }, [nodes, seed, removedSeed]);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/investigations');
      const data = await res.json();
      setSaved(data.investigations ?? []);
    } catch {
      /* listing is non-critical */
    }
  }, []);

  useEffect(() => {
    if (open) void loadSaved();
  }, [open, loadSaved]);

  const addNode = (node: GraphNode) =>
    setNodes((prev) => (prev.some((n) => n.id === node.id) ? prev : [...prev, node]));

  const addLink = (link: GraphLink) =>
    setLinks((prev) =>
      prev.some((l) => l.source === link.source && l.target === link.target) ? prev : [...prev, link]
    );

  const addManual = () => {
    const id = newEntity.trim();
    if (!id) return;
    addNode({ id, label: id, type: newType });
    setNewEntity('');
  };

  /** Pull related entities for a node out of the intel layer. */
  const expand = useCallback(async (node: GraphNode) => {
    if (!EXPANDABLE.has(node.type)) {
      setError(`"${node.type}" entities cannot be expanded — expandable: ${[...EXPANDABLE].join(', ')}.`);
      return;
    }
    setBusy(node.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/entity/expand?type=${encodeURIComponent(node.type)}&id=${encodeURIComponent(node.id)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Expand failed (${res.status}).`);
        return;
      }
      const related: Array<Record<string, unknown>> =
        data.related ?? data.entities ?? data.results ?? [];
      if (related.length === 0) {
        setError('No related entities returned for this node.');
        return;
      }
      for (const r of related) {
        const id = String(r.id ?? r.name ?? r.label ?? '').trim();
        if (!id) continue;
        addNode({
          id,
          label: String(r.label ?? r.name ?? id),
          type: String(r.type ?? 'entity'),
          sanctioned: Boolean(r.sanctioned),
        });
        addLink({ source: node.id, target: id, label: String(r.relation ?? 'linked to') });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expand request failed.');
    } finally {
      setBusy(null);
    }
  }, []);

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentId, name, graph: { nodes: allNodes, links } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Save failed.');
        return;
      }
      setCurrentId(data.investigation.id);
      await loadSaved();
    } finally {
      setBusy(null);
    }
  };

  const load = async (id: string) => {
    const res = await fetch(`/api/investigations?id=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const { investigation } = await res.json();
    setCurrentId(investigation.id);
    setName(investigation.name);
    setNodes(investigation.graph.nodes ?? []);
    setLinks(investigation.graph.links ?? []);
    // Loading a saved graph replaces the working set, seed included.
    setRemovedSeed(true);
  };

  const exportDossier = async (format: 'markdown' | 'html') => {
    setBusy('export');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, graph: { nodes: allNodes, links }, format, assess: true }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError('Export failed.');
        return;
      }
      if (format === 'html') {
        // Opened rather than downloaded so the operator can Ctrl+P → PDF.
        const win = window.open('', '_blank');
        win?.document.write(text);
        win?.document.close();
        return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9._-]+/gi, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  // react-force-graph mutates the objects it is handed; give it copies so the
  // saved graph keeps clean string endpoints.
  const graphData = useMemo(
    () => ({ nodes: allNodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }),
    [allNodes, links]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="fixed inset-4 z-[950] flex flex-col overflow-hidden rounded-lg border"
          style={{
            background: 'var(--bg-panel-solid)',
            borderColor: 'var(--border-cyan)',
            color: 'var(--text-primary)',
          }}
          aria-label="Investigation graph"
        >
          <header
            className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-[11px]"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Network size={14} style={{ color: 'var(--cyan-primary)' }} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded bg-transparent px-2 py-1 font-bold outline-none"
              style={{ border: '1px solid var(--border-primary)' }}
              aria-label="Investigation name"
            />
            <span className="opacity-60">
              {allNodes.length} entities · {links.length} links
            </span>

            <div className="ml-auto flex items-center gap-1">
              <button onClick={save} disabled={busy === 'save'} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
                style={{ background: 'var(--bg-tertiary)' }}>
                {busy === 'save' ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} SAVE
              </button>
              <button onClick={() => exportDossier('markdown')} disabled={busy === 'export'} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
                style={{ background: 'var(--bg-tertiary)' }}>
                <FileDown size={10} /> .MD
              </button>
              <button onClick={() => exportDossier('html')} disabled={busy === 'export'} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
                style={{ background: 'var(--gold-primary)', color: '#000' }}>
                <FileDown size={10} /> PDF
              </button>
              <button onClick={onClose} aria-label="Close" className="ml-1 opacity-70 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside
              className="w-56 shrink-0 space-y-3 overflow-y-auto border-r p-2 text-[10px]"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="space-y-1">
                <div className="flex gap-1">
                  <input value={newEntity} onChange={(e) => setNewEntity(e.target.value)} placeholder="entity id"
                    className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 outline-none"
                    style={{ border: '1px solid var(--border-primary)' }} />
                  <button onClick={addManual} aria-label="Add entity" className="rounded px-1.5" style={{ background: 'var(--bg-tertiary)' }}>
                    <Plus size={10} />
                  </button>
                </div>
                <select value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="w-full rounded px-1 py-1 outline-none"
                  style={{ border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                  {[...EXPANDABLE, 'wallet', 'domain'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="font-bold opacity-60">ENTITIES</div>
                {allNodes.length === 0 && <p className="opacity-50">Add an entity to begin.</p>}
                {allNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => expand(n)}
                    disabled={busy === n.id}
                    title="Expand this entity"
                    className="flex w-full items-center gap-1 rounded border px-1.5 py-1 text-left"
                    style={{ borderColor: 'var(--border-primary)' }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLOR[n.type] ?? '#888' }} />
                    <span className="min-w-0 flex-1 truncate">{n.label}</span>
                    {n.sanctioned && <AlertTriangle size={9} style={{ color: '#ff6b6b' }} />}
                    {busy === n.id && <Loader2 size={9} className="animate-spin" />}
                  </button>
                ))}
              </div>

              {saved.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-bold opacity-60">
                    <FolderOpen size={9} /> SAVED
                  </div>
                  {saved.map((s) => (
                    <button key={s.id} onClick={() => load(s.id)} className="block w-full truncate rounded px-1.5 py-1 text-left hover:opacity-100"
                      style={{ background: 'var(--bg-tertiary)', opacity: s.id === currentId ? 1 : 0.7 }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <p className="flex items-start gap-1" style={{ color: '#ff6b6b' }}>
                  <AlertTriangle size={9} className="mt-0.5 shrink-0" /> {error}
                </p>
              )}
            </aside>

            <div className="min-w-0 flex-1">
              {/* @ts-expect-error — react-force-graph ships loose prop types */}
              <ForceGraph2D
                graphData={graphData}
                nodeLabel={(n: GraphNode) => `${n.label} (${n.type})`}
                nodeColor={(n: GraphNode) => (n.sanctioned ? '#ff3b30' : TYPE_COLOR[n.type] ?? '#888')}
                linkLabel={(l: GraphLink) => l.label ?? ''}
                linkColor={() => 'rgba(255,255,255,.25)'}
                backgroundColor="transparent"
                onNodeClick={(n: GraphNode) => expand(n)}
              />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
