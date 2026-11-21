import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../src/engine/show-file';
import { validateShow } from '../../src/shared/show';
import { noteName, paletteEntries, paletteFiles, paletteShow, SHOW_NAME } from './palette';

const show = paletteShow();
const scenesIn = (tag: string) => show.scenes.filter((s) => s.tags.includes(tag));

describe('the Palette Show', () => {
  it('is a valid Show that loads back as written', () => {
    expect(validateShow(show)).toEqual([]);
    expect(loadShowFile(paletteFiles().show)).toEqual(show);
  });

  it('has the agreed palette on four Layers', () => {
    expect(show.layers.map((l) => l.id)).toEqual(['look', 'movement', 'accent', 'hit']);
    // 24 Looks and the Base Look.
    expect(scenesIn('Look')).toHaveLength(25);
    expect(scenesIn('Movement')).toHaveLength(14);
    expect(scenesIn('Accent')).toHaveLength(12);
    expect(scenesIn('Hit')).toHaveLength(10);
  });

  it('fires every Scene from its own note on channel 1', () => {
    const notes = show.triggers.map((t) => t.note);
    expect(new Set(notes).size).toBe(notes.length);
    expect(show.triggers.every((t) => t.channel === 1)).toBe(true);
    for (const scene of show.scenes) {
      expect(show.triggers.some((t) => t.scene === scene.id && t.mode !== 'release')).toBe(true);
    }
    const house = (show.housePresets ?? []).map((p) => p.note?.note);
    const haze = (show.hazePresets ?? []).map((p) => p.note?.note);
    expect([...house, ...haze].some((n) => n !== undefined && notes.includes(n))).toBe(false);
    expect(new Set([...house, ...haze]).size).toBe(house.length + haze.length);
  });

  it('keeps Movement Scenes to aim and Hits to Flash', () => {
    for (const scene of scenesIn('Movement')) {
      for (const rule of scene.rules) {
        expect(rule.intensity).toBeUndefined();
        expect(rule.colour).toBeUndefined();
      }
    }
    const hits = new Set(scenesIn('Hit').map((s) => s.id));
    for (const entry of paletteEntries().filter((e) => hits.has(e.scene.id))) {
      expect(entry.mode).toBe('flash');
    }
  });

  it('has a Base Look and no Fallback Panel Scenes', () => {
    expect(show.baseLook).toBe('base');
    expect(show).not.toHaveProperty('panelScenes');
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

describe('the committed Palette Show', () => {
  it('is what scripts/make-shows writes (run npm run show:palette)', () => {
    const read = (name: string) =>
      readFileSync(new URL(`../../shows/${name}`, import.meta.url), 'utf8');
    expect(paletteFiles()).toEqual({
      show: read(`${SHOW_NAME}.lcshow`),
      cueSheet: read(`${SHOW_NAME} cue sheet.md`),
    });
  });
});
