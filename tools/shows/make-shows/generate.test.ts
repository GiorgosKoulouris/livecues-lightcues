import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../../src/engine/show-file';
import { loadVenueFile } from '../../../src/engine/venue-file';
import { validateShow, type Rule, type Scene } from '../../../src/shared/show';
import { DEFAULT_RIG, loadBrief } from './brief';
import {
  colourOf,
  composeLook,
  fileName,
  flashingScenes,
  generate,
  generateFiles,
  levelOf,
  presentParts,
  RECIPES,
  tierRecipes,
} from './generate';
import { TIER_BANDS, TIERS } from './rules';
import { lintShow, tierOf } from './show-lint';
import { parseSongSets } from './song-sets';
import { venueCheckLines } from './write';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const sample = loadBrief(fileURLToPath(fixture('sample-brief.yaml')));
const files = generateFiles(sample.brief, sample.venue);
const show = loadShowFile(files.show);
const scene = (id: string): Scene => show.scenes.find((s) => s.id === id)!;
const looks = show.scenes.filter((s) => s.layer === 'look' && tierOf(s) !== undefined);

describe('intensity rules (I1, I2)', () => {
  it('climbs by tier on the back and keeps it inside the I1 bands', () => {
    const back = TIERS.map((t) => levelOf(t, 'back'));
    expect(back).toEqual([...back].sort((a, b) => a - b));
    expect(back[0]).toBeGreaterThanOrEqual(0.4);
    expect(back[0]).toBeLessThanOrEqual(0.5);
    expect(back[1]).toBeGreaterThanOrEqual(0.6);
    expect(back[1]).toBeLessThanOrEqual(0.7);
    expect(back[2]).toBeGreaterThanOrEqual(0.85);
    expect(back[2]).toBeLessThanOrEqual(0.9);
    expect(back[3]).toBe(1);
  });

  it('keeps the front above its tier floor', () => {
    for (const tier of TIERS) {
      expect(levelOf(tier, 'front')).toBeGreaterThanOrEqual(TIER_BANDS[tier].frontMin);
    }
  });
});

describe('composition rules (R1-R3, I4, I5)', () => {
  const all = [...presentParts(DEFAULT_RIG), 'fx' as const];
  const partsOf = (s: Scene) => s.tags.filter((t) => t.startsWith('part:')).map((t) => t.slice(5));

  it('takes slot colours on every part, the front included, with no kelvin', () => {
    for (const rule of looks.flatMap((s) => s.rules)) {
      expect(rule.colour).toHaveProperty('slot');
      expect(rule.movementEffect).toBeUndefined();
      expect(rule.intensityEffect).toBeUndefined();
    }
  });

  it('puts the Primary on the back, the Secondary on the floor and the Accent on the beams', () => {
    expect(colourOf('front', 'main')).toEqual({ slot: 'Primary' });
    expect(colourOf('back', 'main')).toEqual({ slot: 'Primary' });
    expect(colourOf('floor', 'main')).toEqual({ slot: 'Secondary' });
    expect(colourOf('beams', 'main')).toEqual({ slot: 'Accent' });
  });

  it('has the swap, accent-back and accent-floor maps', () => {
    expect(colourOf('back', 'swap')).toEqual({ slot: 'Secondary' });
    expect(colourOf('floor', 'swap')).toEqual({ slot: 'Primary' });
    expect(colourOf('back', 'accent-back')).toEqual({ slot: 'Accent' });
    expect(colourOf('floor', 'accent-floor')).toEqual({ slot: 'Accent' });
  });

  it('gives each tier 6-7 Looks, none sharing parts, slot map and split', () => {
    for (const tier of TIERS) {
      const recipes = tierRecipes(tier, all);
      expect(recipes.length).toBeGreaterThanOrEqual(6);
      expect(recipes.length).toBeLessThanOrEqual(7);
      const keys = recipes.map((r) => `${r.parts.join()}|${r.map}|${r.split ?? ''}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(recipes.map((r) => r.name)).size).toBe(recipes.length);
    }
  });

  it('lights at most two parts in Chill and every part in a Peak Look', () => {
    for (const recipe of tierRecipes('chill', all))
      expect(recipe.parts.length).toBeLessThanOrEqual(2);
    for (const recipe of tierRecipes('peak', all)) expect(recipe.parts).toEqual(all);
  });

  it('puts the front in every sung Look', () => {
    for (const tier of TIERS) {
      for (const recipe of RECIPES[tier]) expect(recipe.parts).toContain('front');
    }
  });

  it('splits left/right and front-to-back from Groove up', () => {
    for (const tier of ['groove', 'drive', 'peak'] as const) {
      const splits = tierRecipes(tier, all).map((r) => r.split);
      expect(splits).toContain('lr');
      expect(splits).toContain('fb');
    }
    for (const r of tierRecipes('chill', all)) expect(r.split).toBeUndefined();
  });

  it('cuts a left/right split by column and a front-to-back one by row', () => {
    const columns = (r: Rule) => new Set(r.target.zones?.map((z) => z.column));
    const rows = (r: Rule) => new Set(r.target.zones?.map((z) => z.row));
    const lr = composeLook('peak', { parts: ['back'], map: 'main', split: 'lr' });
    expect(lr.map((r) => r.colour)).toEqual([{ slot: 'Primary' }, { slot: 'Secondary' }]);
    expect([...columns(lr[0]!)].sort()).toEqual(['Centre', 'Stage Left']);
    expect([...columns(lr[1]!)]).toEqual(['Stage Right']);
    const fb = composeLook('peak', { parts: ['front', 'back', 'floor'], map: 'main', split: 'fb' });
    expect(fb.map((r) => r.colour)).toEqual([
      { slot: 'Primary' },
      { slot: 'Secondary' },
      { slot: 'Primary' },
      { slot: 'Secondary' },
    ]);
    expect([...rows(fb[2]!)]).toEqual(['Front', 'Downstage']);
    expect([...rows(fb[3]!)]).toEqual(['Midstage', 'Upstage']);
  });

  it('lights every part the rig has in every Peak Look (I1, I5)', () => {
    for (const present of [all, all.filter((p) => p !== 'floor'), all.filter((p) => p !== 'fx')]) {
      for (const recipe of tierRecipes('peak', present)) expect(recipe.parts).toEqual(present);
    }
    const peak = looks.filter((s) => tierOf(s) === 'peak');
    expect(peak.length).toBeGreaterThan(0);
    for (const s of peak) expect(partsOf(s).sort()).toEqual([...presentParts(sample.venue)].sort());
  });

  it('gives a venue without a part fewer Looks, never one targeting the part', () => {
    for (const missing of ['beams', 'floor', 'fx', 'back'] as const) {
      const present = all.filter((p) => p !== missing);
      for (const tier of TIERS) {
        const recipes = tierRecipes(tier, present);
        expect(recipes.length).toBeGreaterThan(0);
        expect(recipes.length).toBeLessThanOrEqual(tierRecipes(tier, all).length);
        for (const r of recipes) expect(r.parts).not.toContain(missing);
        const keys = recipes.map((r) => `${r.parts.join()}|${r.map}|${r.split ?? ''}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
    expect(tierRecipes('groove', ['front', 'back']).length).toBeLessThan(
      tierRecipes('groove', all).length,
    );
    expect(tierRecipes('chill', [])).toEqual([]);
  });

  it('keeps every tier to eight Looks or fewer, tagged with tier and parts', () => {
    for (const tier of TIERS) {
      const inTier = looks.filter((s) => tierOf(s) === tier);
      expect(inTier.length).toBeGreaterThan(0);
      expect(inTier.length).toBeLessThanOrEqual(8);
      for (const s of inTier) {
        expect(s.name.startsWith(`${tier[0]!.toUpperCase()}${tier.slice(1)}: `)).toBe(true);
        expect(s.tags).toContain(`tier:${tier}`);
        expect(s.tags.some((t) => t.startsWith('part:'))).toBe(true);
      }
    }
  });

  it('fades in and out in beats, slow when quiet and snapped at Peak', () => {
    for (const s of looks) {
      expect(s.fadeUnit).toBe('beats');
      expect(s.fadeOutUnit).toBe('beats');
      expect(s.fadeOut).toBeGreaterThan(0);
    }
    expect(scene('chill-glow').fadeIn).toBeGreaterThan(scene('groove-steady').fadeIn);
    expect(scene('peak-everything').fadeIn).toBe(0);
  });
});

describe('the sample Show', () => {
  it('is a valid Show that loads back as written', () => {
    expect(validateShow(show)).toEqual([]);
    expect(loadShowFile(files.show)).toEqual(generate(sample.brief, sample.venue).show);
  });

  it('has the utilities, a Base Look and a Look Layer release', () => {
    for (const id of ['base', 'dark', 'silhouette', 'shafts', 'walk-on', 'reveal', 'bow']) {
      expect(scene(id)).toBeDefined();
    }
    expect(show.baseLook).toBe('base');
    expect(show.triggers.find((t) => t.mode === 'release')).toMatchObject({ channel: 1, note: 0 });
  });

  it('keeps every note unique and fires each Scene once, by Go', () => {
    const keys = show.triggers.map((t) => `${t.channel}:${t.note}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of show.scenes) {
      expect(show.triggers.filter((t) => t.scene === s.id && t.mode !== 'release')).toHaveLength(1);
    }
  });

  it('has the Colour Set pool on channel 6, the override as a Main, and the Strobe cap', () => {
    const names = show.colourSets?.map((c) => c.name);
    expect(names).toContain('Blue / Lavender / White');
    expect(names).toContain('Lavender / Blue / White');
    expect(new Set(names).size).toBe(names?.length);
    expect(show.colourSets?.every((c) => c.note?.channel === 6)).toBe(true);
    expect(show.strobeCap).toBe(4);
    expect(
      loadShowFile(generateFiles({ ...sample.brief, strobeHz: 2.5 }, sample.venue).show).strobeCap,
    ).toBe(2.5);
  });

  it('passes the Venue Check on the fixture venue, but for the Strobe Hit', () => {
    const patch = loadVenueFile(readFileSync(fixture('sample-venue.lcvenue'), 'utf8'));
    // The sample washes and beams have no strobe channel, so the one Scene that
    // strobes, the Hit, is approximated on them. Nothing else is reported.
    const lines = venueCheckLines(show, patch);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines)
      expect(line).toContain('strobe approximated (noStrobeChannel) in 1 Scene');
  });

  it('scores every lint item 2 but Variety, held at 1 by the sample venue', () => {
    const songs = parseSongSets(files.cueSheet);
    expect(songs?.length).toBe(sample.brief.songs.length);
    for (const bpm of [120, 154, 200]) {
      const report = lintShow(show, bpm, songs);
      expect(report.scored).toBe(10);
      // The sample venue lacks a part, so Colour FX has 5 Scenes a tier, not 6: Variety 1.
      for (const i of report.items) {
        expect(i.score, `item ${i.item} at ${bpm} BPM`).toBe(i.item === 17 ? 1 : 2);
      }
    }
  });

  it('flags only Hits as flashing, and no Scene fired by Go', () => {
    const hits = new Set(show.triggers.filter((t) => t.mode === 'flash').map((t) => t.scene));
    expect(flashingScenes(show, 154).length).toBeGreaterThan(0);
    for (const s of flashingScenes(show, 154)) expect(hits.has(s.id)).toBe(true);
    expect(files.cueSheet).toContain(
      'No Scene fired by Go flashes faster than the cap at 154 BPM, the fastest song.',
    );
    expect(files.cueSheet).toContain('Hit: Strobe');
  });

  it('flags a beat-rate strobe at the fastest song BPM, not at 120', () => {
    const half: Scene = {
      id: 'half',
      name: 'Half',
      tags: [],
      layer: 'look',
      fadeIn: 0,
      rules: [{ target: {}, strobe: 0.5 }],
    };
    const capped = { ...show, scenes: [half], strobeCap: 4 };
    expect(flashingScenes(capped)).toEqual([]);
    expect(flashingScenes(capped, 154)).toEqual([half]);
  });

  it('names the BPM the flashing list is read at', () => {
    expect(files.cueSheet).toMatch(/at \d+ BPM/);
  });

  it('writes the cue sheet layout, Colour Sets with notes, and Scenes with tags', () => {
    for (const text of [
      '## Colour Sets',
      '## Note map',
      '### Channel 1: Look',
      '### Song sets',
      '| Opener | ',
      'tier:chill',
      'part:front',
    ]) {
      expect(files.cueSheet).toContain(text);
    }
  });
});

describe('the Cue Sheet colour tables', () => {
  it('lists the Colour Sets without a Songs column, then each song’s Main, Break and Swap', () => {
    expect(files.cueSheet).toContain(
      '| Note | # | Colour Set | Primary | Secondary | Accent | Fade |',
    );
    expect(files.cueSheet).toContain('| Song | Main | Break | Swap |');
    expect(files.cueSheet).not.toContain('| Songs |');
    for (const name of ['Opener', 'Slow Tide', 'Last Train']) {
      expect(files.cueSheet).toMatch(new RegExp(`\\| ${name} \\| .+ \\| .+ \\| .+ \\|`));
    }
  });

  it('puts the Show’s Colour Sets at 1 s fades', () => {
    // 3 songs make 6 sets, and the one colour override adds its Main and Swap.
    expect(show.colourSets).toHaveLength(8);
    for (const set of show.colourSets ?? []) expect(set.fade).toBe(1);
  });
});

describe('the brief changes the Show', () => {
  it('leaves out a part the venue lacks and says so in the Cue Sheet', () => {
    const venue = {
      ...DEFAULT_RIG,
      groups: DEFAULT_RIG.groups.filter((g) => g.role !== 'Spot/Beam'),
    };
    const g = generate(sample.brief, venue);
    expect(g.omitted).toContain('beams');
    expect(g.show.scenes.some((s) => s.tags.includes('part:beams'))).toBe(false);
    expect(g.show.scenes.some((s) => s.id === 'shafts')).toBe(true);
    const sheet = generateFiles(sample.brief, venue).cueSheet;
    expect(sheet).toContain('Part left out: beams');
    const shafts = g.show.scenes.find((s) => s.id === 'shafts')!;
    expect(shafts.rules).toHaveLength(2);
  });

  it('builds for the default rig when the brief names no venue', () => {
    const g = generate(sample.brief, DEFAULT_RIG);
    expect(validateShow(g.show)).toEqual([]);
    expect(generateFiles(sample.brief, DEFAULT_RIG).cueSheet).toContain('the default rig');
  });

  it('names the files after the band, safely', () => {
    expect(fileName('Neon Harbour')).toBe('Neon Harbour');
    expect(fileName('AC/DC: Live')).toBe('ACDC Live');
  });
});

describe('the committed sample output', () => {
  it('is what show:generate writes (run npm run show:generate -- tools/shows/make-shows/fixtures/sample-brief.yaml)', () => {
    const read = (name: string) => readFileSync(fixture(name), 'utf8');
    expect(files).toEqual({
      show: read('Neon Harbour.lcshow'),
      cueSheet: read('Neon Harbour cue sheet.md'),
    });
  });
});
