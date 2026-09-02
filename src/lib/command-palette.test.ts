import { describe, it, expect } from 'vitest';
import { buildGeoCommands, searchCommands, titleCase, type Command } from './command-palette';

const cmd = (label: string, kind: Command['kind'] = 'country'): Command =>
  ({ id: label, kind, label, hint: '', action: {} });

describe('buildGeoCommands', () => {
  const cmds = buildGeoCommands();

  it('yields one command per country with real coordinates', () => {
    const ua = cmds.find(c => c.id === 'country:UA');
    expect(ua?.label).toBe('Ukraine');
    expect(ua?.action.lat).toBeTypeOf('number');
  });

  it('includes cities from the gazetteer', () => {
    expect(cmds.some(c => c.kind === 'city' && c.label === 'Beijing')).toBe(true);
  });
});

describe('searchCommands', () => {
  it('empty query yields nothing', () => {
    expect(searchCommands([cmd('Ukraine')], '  ')).toEqual([]);
  });

  it('prefix beats substring', () => {
    const out = searchCommands([cmd('South Sudan'), cmd('Sudan')], 'sud');
    expect(out[0].label).toBe('Sudan');
  });

  it('word-boundary match beats mid-word', () => {
    const out = searchCommands([cmd('Mozambique'), cmd('South Ambia')], 'amb');
    // ' amb' word boundary in 'South Ambia' outranks 'moz-amb-ique'
    expect(out[0].label).toBe('South Ambia');
  });

  it('shorter label wins a tie', () => {
    const out = searchCommands([cmd('Chad Basin'), cmd('Chad')], 'cha');
    expect(out[0].label).toBe('Chad');
  });

  it('layer kind outranks city on identical labels', () => {
    const out = searchCommands([cmd('Radar', 'city'), cmd('Radar', 'layer')], 'radar');
    expect(out[0].kind).toBe('layer');
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => cmd(`Test ${i}`));
    expect(searchCommands(many, 'test', 5)).toHaveLength(5);
  });
});

describe('titleCase', () => {
  it('capitalises each word', () => {
    expect(titleCase('bosnia herzegovina')).toBe('Bosnia Herzegovina');
  });
});
