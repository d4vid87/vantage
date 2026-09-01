/** Saved link-analysis investigations, persisted in the SQLite store. */

import { db, newId } from './db';
import type { InvestigationGraph } from './report';

export interface Investigation {
  id: string;
  name: string;
  graph: InvestigationGraph;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  name: string;
  graph: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toInvestigation(row: Row): Investigation {
  return {
    id: row.id,
    name: row.name,
    graph: JSON.parse(row.graph) as InvestigationGraph,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listInvestigations(): Investigation[] {
  return (
    db().prepare('SELECT * FROM investigations ORDER BY updated_at DESC').all() as Row[]
  ).map(toInvestigation);
}

export function getInvestigation(id: string): Investigation | null {
  const row = db().prepare('SELECT * FROM investigations WHERE id = ?').get(id) as Row | undefined;
  return row ? toInvestigation(row) : null;
}

export function saveInvestigation(input: {
  id?: string;
  name: string;
  graph: InvestigationGraph;
  notes?: string;
}): Investigation {
  const now = new Date().toISOString();
  const handle = db();

  if (input.id && getInvestigation(input.id)) {
    handle
      .prepare('UPDATE investigations SET name = ?, graph = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(input.name, JSON.stringify(input.graph), input.notes ?? '', now, input.id);
    return getInvestigation(input.id)!;
  }

  const id = input.id ?? newId('inv');
  handle
    .prepare(
      'INSERT INTO investigations (id, name, graph, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, input.name, JSON.stringify(input.graph), input.notes ?? '', now, now);
  return getInvestigation(id)!;
}

export function deleteInvestigation(id: string): void {
  db().prepare('DELETE FROM investigations WHERE id = ?').run(id);
}
