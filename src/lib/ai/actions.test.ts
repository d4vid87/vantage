import { describe, it, expect } from 'vitest';
import { parseActions, MAX_ACTIONS } from './actions';

const block = (json: string) => `Here is the read-out.\n\n\`\`\`vantage-actions\n${json}\n\`\`\``;

describe('parseActions', () => {
  it('returns prose unchanged when there is no action block', () => {
    expect(parseActions('Just an assessment.')).toEqual({
      text: 'Just an assessment.',
      actions: [],
    });
  });

  it('extracts valid actions and strips the block from the prose', () => {
    const { text, actions } = parseActions(
      block('[{"type":"toggleLayer","layer":"earthquakes","label":"Show quakes"}]')
    );
    expect(text).toBe('Here is the read-out.');
    expect(text).not.toContain('vantage-actions');
    expect(actions).toEqual([
      { type: 'toggleLayer', layer: 'earthquakes', label: 'Show quakes' },
    ]);
  });

  it('drops a layer that is not in the allow-list', () => {
    const { actions } = parseActions(block('[{"type":"toggleLayer","layer":"nuclear_codes"}]'));
    expect(actions).toEqual([]);
  });

  it('drops an unknown action type', () => {
    const { actions } = parseActions(block('[{"type":"deleteEverything","target":"db"}]'));
    expect(actions).toEqual([]);
  });

  it('accepts flyTo with in-range coordinates and clamps zoom', () => {
    const { actions } = parseActions(block('[{"type":"flyTo","lat":38.2,"lng":141,"zoom":99}]'));
    expect(actions).toEqual([{ type: 'flyTo', lat: 38.2, lng: 141, zoom: 18 }]);
  });

  it('rejects out-of-range coordinates', () => {
    const { actions } = parseActions(block('[{"type":"flyTo","lat":999,"lng":141}]'));
    expect(actions).toEqual([]);
  });

  it('caps the number of actions', () => {
    const many = JSON.stringify(
      Array.from({ length: 10 }, () => ({ type: 'toggleLayer', layer: 'flights' }))
    );
    expect(parseActions(block(many)).actions).toHaveLength(MAX_ACTIONS);
  });

  it('keeps the prose when the block is malformed JSON', () => {
    const { text, actions } = parseActions(block('{not json'));
    expect(text).toBe('Here is the read-out.');
    expect(actions).toEqual([]);
  });

  it('accepts a single object as well as an array', () => {
    const { actions } = parseActions(block('{"type":"toggleLayer","layer":"fires"}'));
    expect(actions).toEqual([{ type: 'toggleLayer', layer: 'fires', label: undefined }]);
  });
});
