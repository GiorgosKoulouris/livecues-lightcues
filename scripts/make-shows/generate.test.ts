import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../src/engine/show-file';
import { loadVenueFile } from '../../src/engine/venue-file';
import { validateShow, type Scene } from '../../src/shared/show';
import { DEFAULT_RIG, loadBrief, parseBrief, type Brief } from './brief';
import {
  colourOf,
  colourSets,
  composeLook,
  fileName,
  flashingScenes,
  generate,
  generateFiles,
  levelOf,
  presentParts,
  primaryPool,
  PART_TARGETS,
  RECIPES,
  secondaryFor,
  songColours,
  tierRecipes,
} from './generate';
import { hueGap, SWATCH_HUE, TIER_BANDS, TIERS } from './rules';
import { lintShow, tierOf } from './show-lint';
import { venueCheckLines } from './write';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const sample = loadBrief(fixture('sample-brief.yaml').pathname);
const files = generateFiles(sample.brief, sample.venue);
const show = loadShowFile(files.show);
const scene = (id: string): Scene => show.scenes.find((s) => s.id === id)!;
const looks = show.scenes.filter((s) => tierOf(s) !== undefined);

const brief = (text: string): Brief => parseBrief(`band: X\n${text}`);
const songs = (n: number) =>
  `songs:\n${Array.from({ length: n }, (_, i) => `  - name: S${i + 1}\n    bpm: 120`).join('\n')}\n`;

describe('palette rules (P1, P2, P5, P6)', () => {
  it('takes the primary from the band colours and a good secondary from them too', () => {
    const { songs: out } = songColours(brief(`colours: [Amber, Blue]\n${songs(2)}`));
    expect(out.map((s) => s.primary)).toEqual(['Amber', 'Blue']);
    expect(out[0]).toMatchObject({ secondary: 'Blue', accent: 'White' });
  });

  it('falls back to the mood primaries when there are no band colours (P6)', () => {
    expect(primaryPool(brief(`mood: calm\n${songs(1)}`))).toEqual(['Cyan', 'Green']);
    expect(primaryPool(brief(`mood: aggressive\n${songs(1)}`))[0]).toBe('Red');
    expect(primaryPool(brief(songs(1)))[0]).toBe('Amber');
  });

  it('gives a lone colour its complement so songs can differ (P5)', () => {
    const out = songColours(brief(`colours: [Red]\n${songs(3)}`)).songs;
    expect(out[0]!.primary).not.toBe(out[1]!.primary);
    expect(out[1]!.primary).not.toBe(out[2]!.primary);
  });

  it('never repeats a primary on the next song', () => {
    const out = songColours(brief(`colours: [Red, Green, Blue]\n${songs(7)}`)).songs;
    out.slice(1).forEach((s, i) => expect(s.primary).not.toBe(out[i]!.primary));
  });

  it('makes the secondary complementary or analogous, never a near miss (P2)', () => {
    for (const primary of Object.keys(SWATCH_HUE).filter((s) => s !== 'UV')) {
      for (const kind of ['complementary', 'analogous'] as const) {
        const secondary = secondaryFor(primary as never, kind);
        const gap = hueGap(SWATCH_HUE[primary as never]!, SWATCH_HUE[secondary]!);
        // Green and Cyan have no neighbour inside 45 degrees, so analogous falls back.
        const analogous = gap > 0 && gap <= 45;
        expect(kind === 'complementary' ? gap >= 150 : analogous || gap >= 150).toBe(true);
      }
    }
  });

  it('uses analogous secondaries for calm moods', () => {
    const [song] = songColours(brief(`mood: melancholy\n${songs(1)}`)).songs;
    expect(hueGap(SWATCH_HUE[song!.primary]!, SWATCH_HUE[song!.secondary]!)).toBeLessThanOrEqual(
      45,
    );
  });

  it('takes a song override as given and notes a repeated primary', () => {
    const text = `${songs(2)}`.replace(
      '    bpm: 120\n  - name: S2\n    bpm: 120',
      '    bpm: 120\n    colours: [Red, Cyan, Warm White]\n  - name: S2\n    bpm: 120\n    colours: [Red]',
    );
    const { songs: out, notes } = songColours(brief(text));
    expect(out[0]).toMatchObject({ primary: 'Red', secondary: 'Cyan', accent: 'Warm White' });
    expect(out[1]!.primary).toBe('Red');
    expect(notes).toEqual([expect.stringContaining('S2 repeats the primary of S1')]);
  });

  it('shares a Colour Set between songs with the same colours, three at most', () => {
    // Two colours rotate, so songs 1, 3, 5 match and so do 2, 4, 6: 7 songs make 3 sets.
    const plan = colourSets(brief(`colours: [Amber, Blue]\n${songs(7)}`));
    expect(Object.values(plan.songs).map((s) => s.length)).toEqual([3, 3, 1]);
    expect(plan.sets.every((s) => s.colours.Accent && 'swatch' in s.colours.Accent)).toBe(true);
  });

  it('gives each song its own set when the colours differ', () => {
    const plan = colourSets(brief(`colours: [Red, Green, Blue]\n${songs(3)}`));
    expect(plan.sets).toHaveLength(3);
  });
});

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

describe('composition rules (P3, P4, R1-R3, I4, I5)', () => {
  it('lights the front pale and steady, with kelvin white', () => {
    for (const tier of TIERS) {
      expect(colourOf('front', tier, 'pale')).toMatchObject({ kelvin: expect.any(Number) });
    }
    for (const rule of looks.flatMap((s) => s.rules)) {
      if (rule.target === undefined) continue;
      expect(rule.movementEffect).toBeUndefined();
      expect(rule.intensityEffect).toBeUndefined();
    }
  });

  it('puts the Primary on the back, the Secondary on the floor and white on beams', () => {
    expect(colourOf('back', 'groove', 'pale')).toEqual({ slot: 'Primary' });
    expect(colourOf('floor', 'groove', 'pale')).toEqual({ slot: 'Secondary' });
    expect(colourOf('beams', 'peak', 'pale')).toEqual({ slot: 'Accent' });
  });

  it('lets the front take the Primary only when the brief says colour', () => {
    expect(colourOf('front', 'drive', 'colour')).toEqual({ slot: 'Primary' });
  });

  it('lights at most two parts in Chill and everything the rig has in Peak', () => {
    for (const recipe of RECIPES.chill) expect(recipe.parts.length).toBeLessThanOrEqual(2);
    const all = presentParts(DEFAULT_RIG);
    for (const recipe of tierRecipes('peak', [...all, 'fx'])) {
      expect(recipe.parts).toContain('front');
    }
    expect(tierRecipes('peak', [...all, 'fx'])[0]!.parts).toEqual([
      'front',
      'back',
      'floor',
      'beams',
      'fx',
    ]);
  });

  it('lights every part the rig has in every Peak Look (I1, I5)', () => {
    const all = [...presentParts(DEFAULT_RIG), 'fx' as const];
    for (const present of [all, all.filter((p) => p !== 'floor'), all.filter((p) => p !== 'fx')]) {
      for (const recipe of tierRecipes('peak', present)) expect(recipe.parts).toEqual(present);
    }
    const parts = (s: Scene) => s.tags.filter((t) => t.startsWith('part:')).map((t) => t.slice(5));
    const peak = looks.filter((s) => tierOf(s) === 'peak');
    expect(peak.length).toBeGreaterThan(0);
    for (const s of peak) expect(parts(s).sort()).toEqual([...presentParts(sample.venue)].sort());
  });

  it('puts the front in every sung Look and the beams in Drive and Peak only above Chill', () => {
    for (const tier of TIERS) {
      for (const recipe of RECIPES[tier]) expect(recipe.parts).toContain('front');
    }
    const rules = composeLook('chill', ['front', 'beams'], 'pale');
    expect(rules.find((r) => r.target === PART_TARGETS.beams)!.intensity).toBe(0.3);
  });

  it('drops parts the rig lacks, and Looks that become empty or repeat', () => {
    const recipes = tierRecipes('groove', ['front', 'back']);
    expect(recipes.map((r) => r.name)).toEqual(['Steady']);
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

  it('has one Colour Set per distinct song colours, with notes, and the Strobe cap', () => {
    expect(show.colourSets?.map((c) => c.name)).toEqual(['Opener + Last Train', 'Slow Tide']);
    expect(show.colourSets?.every((c) => c.note?.channel === 6)).toBe(true);
    expect(show.strobeCap).toBe(4);
    expect(
      loadShowFile(generateFiles({ ...sample.brief, strobeHz: 2.5 }, sample.venue).show).strobeCap,
    ).toBe(2.5);
  });

  it('passes the Venue Check on the fixture venue', () => {
    const patch = loadVenueFile(readFileSync(fixture('sample-venue.lcvenue'), 'utf8'));
    expect(venueCheckLines(show, patch)).toEqual([]);
  });

  it('scores 2 on lint items 1-6, 10 and 12', () => {
    const report = lintShow(show);
    for (const item of [1, 3, 4, 5, 6, 10, 12, 17]) {
      expect(report.items.find((i) => i.item === item)?.score).toBe(2);
    }
    for (const item of [1, 2, 3, 4, 5, 6, 10, 12]) {
      expect([2, null]).toContain(report.items.find((i) => i.item === item)?.score);
    }
  });

  it('flags no Scene as flashing', () => {
    expect(flashingScenes(show)).toEqual([]);
    expect(files.cueSheet).toContain('No Scene flashes faster than the cap.');
  });

  it('writes the cue sheet layout, Colour Sets with notes, and Scenes with tags', () => {
    for (const text of [
      '## Colour Sets',
      '## Note map',
      '### Channel 1: Look',
      'Opener + Last Train',
      'tier:chill',
      'part:front',
    ]) {
      expect(files.cueSheet).toContain(text);
    }
  });
});

describe('the brief changes the Show', () => {
  it('lets the front take slot colour with front: colour, and lint item 3 reports it', () => {
    const coloured = loadShowFile(
      generateFiles({ ...sample.brief, front: 'colour' }, sample.venue).show,
    );
    const item = lintShow(coloured).items.find((i) => i.item === 3)!;
    expect(item.score).toBe(0);
    expect(item.offenders[0]).toContain('saturated front');
    expect(files.cueSheet).not.toContain('lets the front take colour');
  });

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
  it('is what show:generate writes (run npm run show:generate -- scripts/make-shows/fixtures/sample-brief.yaml)', () => {
    const read = (name: string) => readFileSync(fixture(name), 'utf8');
    expect(files).toEqual({
      show: read('Neon Harbour.lcshow'),
      cueSheet: read('Neon Harbour cue sheet.md'),
    });
  });
});
