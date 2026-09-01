import { describe, it, expect } from 'vitest';
import { renderHtml, renderMarkdown, type DossierInput } from './report';

const base: DossierInput = {
  name: 'Operation Testbed',
  generatedAt: '2026-01-01T12:30:00.000Z',
  graph: {
    nodes: [
      { id: 'w1', label: '1A1zP1...DivfNa', type: 'wallet', attrs: { balance: 4.2 }, sanctioned: true },
      { id: 'd1', label: 'example.com', type: 'domain' },
    ],
    links: [{ source: 'w1', target: 'd1', label: 'funded' }],
  },
  notes: 'Follow-up required on the registrar.',
};

describe('renderMarkdown', () => {
  it('includes the header, DTG and entity counts', () => {
    const md = renderMarkdown(base);
    expect(md).toContain('# VANTAGE DOSSIER — Operation Testbed');
    expect(md).toContain('2026-01-01 12:30:00Z');
    expect(md).toContain('**Entities:** 2');
    expect(md).toContain('**Relationships:** 1');
  });

  it('flags OFAC SDN matches in both the entity table and the screening section', () => {
    const md = renderMarkdown(base);
    expect(md).toContain('⚠️ SANCTIONED');
    expect(md).toContain('OFAC SDN match');
  });

  it('states explicitly when nothing matched the SDN list', () => {
    const md = renderMarkdown({ ...base, graph: { nodes: [base.graph.nodes[1]], links: [] } });
    expect(md).toContain('No mapped entity matched the OFAC SDN list');
  });

  it('resolves link endpoints to entity labels', () => {
    expect(renderMarkdown(base)).toContain('**funded** example.com');
  });

  it('uses the AI assessment as the BLUF when one is supplied', () => {
    const md = renderMarkdown({ ...base, assessment: 'Network appears to be a laundering chain.' });
    expect(md).toContain('Network appears to be a laundering chain.');
  });

  it('falls back to a generated BLUF without an assessment', () => {
    expect(renderMarkdown(base)).toContain('maps 2 entities across 1 relationships');
  });

  it('handles an empty graph without throwing', () => {
    const md = renderMarkdown({ name: 'Empty', graph: { nodes: [], links: [] } });
    expect(md).toContain('_No entities recorded._');
    expect(md).toContain('_No relationships recorded._');
  });

  it('escapes pipes so a label cannot break the table', () => {
    const md = renderMarkdown({
      name: 'Pipes',
      graph: { nodes: [{ id: 'a', label: 'evil|label', type: 'x' }], links: [] },
    });
    expect(md).toContain('evil\\|label');
  });
});

describe('renderHtml', () => {
  it('emits a print-ready document with the dossier content', () => {
    const html = renderHtml(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@page');
    expect(html).toContain('<h1>VANTAGE DOSSIER — Operation Testbed</h1>');
    expect(html).toContain('<table>');
  });

  it('escapes markup coming from entity labels', () => {
    const html = renderHtml({
      name: 'XSS',
      graph: { nodes: [{ id: 'a', label: '<script>alert(1)</script>', type: 'x' }], links: [] },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
