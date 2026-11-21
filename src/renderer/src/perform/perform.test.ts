import { describe, expect, it } from 'vitest';
import type { Scene, Show } from '../../../shared/show';
import { layerGroups } from './perform';

const scene = (id: string, layer: string): Scene => ({
  id,
  name: id,
  tags: [],
  layer,
  fadeIn: 0,
  rules: [],
});

const SHOW: Show = {
  layers: [
    { id: 'base', name: 'Base' },
    { id: 'fx', name: 'Effects' },
    { id: 'spare', name: 'Spare' },
  ],
  scenes: [scene('strobe', 'fx'), scene('warm', 'base'), scene('cold', 'base')],
  triggers: [],
};

const summary = (show: Show) =>
  layerGroups(show).map((g) => [g.layer.id, g.scenes.map((s) => s.scene.id)]);

describe('layerGroups', () => {
  it('groups every Scene by Layer, in Layer order then Show order, empty Layers included', () => {
    expect(summary(SHOW)).toEqual([
      ['base', ['warm', 'cold']],
      ['fx', ['strobe']],
      ['spare', []],
    ]);
  });
});
