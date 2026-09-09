import { it, expect } from 'vitest';
import { parseDraft } from './investigation-draft';
it('recovers valid drafts and rejects broken graph references', () => {
  const draft = { name: 'Case', graph: { nodes: [{ id: 'a', label: 'A', type: 'company' }], links: [] } };
  expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  expect(parseDraft(JSON.stringify({ ...draft, graph: { ...draft.graph, links: [{ source: 'a', target: 'missing' }] } }))).toBeNull();
  expect(parseDraft('{')).toBeNull();
});
