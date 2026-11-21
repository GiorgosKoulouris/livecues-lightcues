import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../src/engine/show-file';
import { validateShow } from '../../src/shared/show';
import { energyEntries, energyFiles, energyShow, noteName, SHOW_NAME } from './energy';

const show = energyShow();
const scenesIn = (tag: string) => show.scenes.filter((s) => s.tags.includes(tag));
const noteOf = (id: string) =>
  show.triggers.find((t) => t.scene === id && t.mode !== 'release')?.note ?? -1;
const layerOf = (id: string) => show.scenes.find((s) => s.id === id)?.layer;

describe('the Energy Show', () => {
  it('is a valid Show that loads back as written', () => {
    expect(validateShow(show)).toEqual([]);
    expect(loadShowFile(energyFiles().show)).toEqual(show);
  });

  it('has five Layers and about 165 Scenes', () => {
    expect(show.layers.map((l) => l.id)).toEqual(['look', 'movement', 'pulse', 'colourfx', 'hit']);
    expect(show.scenes.length).toBeGreaterThanOrEqual(150);
    expect(show.scenes.length).toBeLessThanOrEqual(175);
    for (const tier of ['Chill', 'Groove', 'Drive', 'Peak']) {
      const inTier = (layer: string) => scenesIn(tier).filter((s) => s.layer === layer);
      expect(inTier('look')).toHaveLength(7);
      expect(inTier('movement')).toHaveLength(7);
      expect(inTier('movement').filter((s) => s.tags.includes('Move+FX'))).toHaveLength(3);
      expect(inTier('pulse')).toHaveLength(9);
      expect(inTier('colourfx')).toHaveLength(6);
    }
    expect(scenesIn('Hit').length).toBeGreaterThanOrEqual(28);
  });

  it('keeps every note unique within its channel', () => {
    const keys = show.triggers.map((t) => `${t.channel}:${t.note}`);
    expect(new Set(keys).size).toBe(keys.length);
    const presets = [...(show.housePresets ?? []), ...(show.hazePresets ?? [])].map((p) => p.note);
    const presetKeys = presets.map((n) => `${n?.channel}:${n?.note}`);
    expect(new Set(presetKeys).size).toBe(presets.length);
    expect(presets.every((n) => n?.channel === 6)).toBe(true);
    expect(presetKeys.some((k) => keys.includes(k))).toBe(false);
  });

  it('fires every Scene from its Layer’s channel', () => {
    const channel = { look: 1, movement: 2, pulse: 3, colourfx: 4, hit: 5 } as Record<
      string,
      number
    >;
    for (const scene of show.scenes) {
      const triggers = show.triggers.filter((t) => t.scene === scene.id && t.mode !== 'release');
      expect(triggers).toHaveLength(1);
      // Hits are on channel 5, even the Blackout hit on the Look Layer.
      expect(triggers[0]?.channel).toBe(scene.tags.includes('Hit') ? 5 : channel[scene.layer]);
    }
  });

  it('puts releases at notes 0–11 and utilities at 12–23 of the Look channel', () => {
    const releases = show.triggers.filter((t) => t.mode === 'release');
    expect(releases.map((t) => t.channel)).toEqual([1, 2, 3, 4, 5]);
    for (const r of releases) {
      expect(r.note).toBeLessThan(12);
      expect(layerOf(r.scene)).toBe(show.layers[r.channel - 1]?.id);
    }
    for (const scene of scenesIn('Utility')) {
      const note = noteOf(scene.id);
      expect(note).toBeGreaterThanOrEqual(12);
      expect(note).toBeLessThanOrEqual(23);
    }
  });

  it('keeps tier Scenes in their tier’s notes', () => {
    const ranges = { Chill: 24, Groove: 48, Drive: 72, Peak: 96 };
    for (const [tier, base] of Object.entries(ranges)) {
      for (const scene of scenesIn(tier)) {
        const note = noteOf(scene.id);
        expect(note).toBeGreaterThanOrEqual(base);
        expect(note).toBeLessThan(base + 24);
      }
    }
  });

  it('keeps Look, Movement and Hit Scenes to their job', () => {
    for (const scene of scenesIn('Movement')) {
      for (const rule of scene.rules) {
        expect(rule.intensity).toBeUndefined();
        expect(rule.colour).toBeUndefined();
        expect(rule.colourEffect).toBeUndefined();
      }
    }
    for (const scene of scenesIn('Pulse').concat(scenesIn('Colour FX'))) {
      for (const rule of scene.rules) expect(rule.intensity).toBeUndefined();
    }
    const hits = new Set(scenesIn('Hit').map((s) => s.id));
    for (const entry of energyEntries().filter((e) => hits.has(e.scene.id))) {
      expect(entry.mode).toBe('flash');
    }
  });

  it('has a Base Look and no Fallback Panel Scenes', () => {
    expect(show.baseLook).toBe('base');
    expect(show).not.toHaveProperty('panelScenes');
  });

  it('writes a cue sheet with a note map per channel', () => {
    const sheet = energyFiles().cueSheet;
    for (const heading of ['Tier guide', 'How the Layers combine', 'House and Haze']) {
      expect(sheet).toContain(heading);
    }
    for (const channel of [1, 2, 3, 4, 5, 6]) expect(sheet).toContain(`### Channel ${channel}:`);
  });

  it('names notes the app’s way', () => {
    expect([noteName(12), noteName(24), noteName(60), noteName(61)]).toEqual([
      'C0',
      'C1',
      'C4',
      'C#4',
    ]);
  });
});

describe('the committed Energy Show', () => {
  it('is what scripts/make-shows writes (run npm run show:energy)', () => {
    const read = (name: string) =>
      readFileSync(new URL(`../../shows/${name}`, import.meta.url), 'utf8');
    expect(energyFiles()).toEqual({
      show: read(`${SHOW_NAME}.lcshow`),
      cueSheet: read(`${SHOW_NAME} cue sheet.md`),
    });
  });
});
