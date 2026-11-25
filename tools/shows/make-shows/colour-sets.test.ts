import { describe, expect, it } from 'vitest';
import { parseBrief, type Brief } from './brief';
import {
  bandHues,
  colourSets,
  contrastHues,
  goodPair,
  poolSize,
  secondaryFor,
  type ColourSetPlan,
} from './colour-sets';
import { hueGap, SWATCH_HUE } from './rules';

const brief = (text: string): Brief => parseBrief(`band: X\n${text}`);
const songs = (n: number) =>
  `songs:\n${Array.from({ length: n }, (_, i) => `  - name: S${i + 1}\n    bpm: 120`).join('\n')}\n`;

const setOf = (plan: ColourSetPlan, id: string) => plan.sets.find((s) => s.id === id)!;
const swatch = (plan: ColourSetPlan, id: string, slot: 'Primary' | 'Secondary' | 'Accent') => {
  const c = setOf(plan, id).colours[slot]!;
  return 'swatch' in c ? c.swatch : undefined;
};
const tally = (ids: string[]) => {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return [...out.values()];
};

describe('pool size', () => {
  it('is clamp(ceil(songs x 2/3), 6, 8)', () => {
    expect([1, 6, 9, 10, 12, 20].map(poolSize)).toEqual([6, 6, 6, 7, 8, 8]);
    expect(colourSets(brief(songs(6))).sets).toHaveLength(6);
    expect(colourSets(brief(songs(12))).sets).toHaveLength(8);
    expect(colourSets(brief(songs(20))).sets).toHaveLength(8);
  });
});

describe('hues', () => {
  it('takes band colours, else the mood primaries (P6)', () => {
    expect(bandHues(brief(`colours: [Amber, White, Blue]\n${songs(1)}`))).toEqual([
      'Amber',
      'Blue',
    ]);
    expect(bandHues(brief(`mood: calm\n${songs(1)}`))).toEqual(['Cyan', 'Green']);
    expect(bandHues(brief(songs(1)))[0]).toBe('Amber');
  });

  it('adds the complement of the first colour and the mood contrast', () => {
    expect(contrastHues(brief(`colours: [Red]\nmood: aggressive\n${songs(1)}`))).toEqual([
      'Cyan',
      'Blue',
    ]);
  });

  it('swaps a mood contrast that is already a band colour', () => {
    const [first, second] = contrastHues(brief(`colours: [Magenta]\nmood: upbeat\n${songs(1)}`));
    expect(first).toBe('Green');
    expect(second).not.toBe('Magenta');
    expect(second).not.toBe(first);
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
});

describe('12 songs, two band colours, aggressive', () => {
  const make = () => brief(`colours: [Green, Magenta]\nmood: aggressive\n${songs(12)}`);
  const plan = colourSets(make());

  it('gives 8 sets with at least 5 distinct Primaries, both contrast hues among them', () => {
    expect(plan.sets).toHaveLength(8);
    const primaries = new Set(plan.sets.map((s) => swatch(plan, s.id, 'Primary')));
    expect(primaries.size).toBeGreaterThanOrEqual(5);
    for (const hue of contrastHues(make())) expect(primaries).toContain(hue);
  });

  it('shows the colours in the set names, not the songs', () => {
    for (const set of plan.sets) expect(set.name).toMatch(/^[A-Za-z ]+ \/ [A-Za-z ]+ \/ /);
  });

  it('fades in 1 s', () => {
    for (const set of plan.sets) expect(set.fade).toBe(1);
  });
});

describe.each([
  [
    '12 songs, two colours',
    () => brief(`colours: [Green, Magenta]\nmood: aggressive\n${songs(12)}`),
  ],
  ['6 songs', () => brief(`colours: [Green, Magenta]\nmood: aggressive\n${songs(6)}`)],
  ['9 songs', () => brief(`colours: [Amber, Blue]\n${songs(9)}`)],
  ['12 songs, one colour', () => brief(`colours: [Green]\nmood: calm\n${songs(12)}`)],
  ['no colours', () => brief(songs(12))],
])('Set roles: %s', (_name, make) => {
  const plan = colourSets(make());

  it('gives every song a distinct Main, Break and Swap', () => {
    for (const s of plan.songs) expect(new Set([s.main, s.break, s.swap]).size).toBe(3);
  });

  it('leads each Break with a contrast hue and swaps Main exactly', () => {
    const [c1, c2] = contrastHues(make());
    for (const s of plan.songs) {
      expect([c1, c2]).toContain(swatch(plan, s.break, 'Primary'));
      expect(swatch(plan, s.swap, 'Primary')).toBe(swatch(plan, s.main, 'Secondary'));
      expect(swatch(plan, s.swap, 'Secondary')).toBe(swatch(plan, s.main, 'Primary'));
      expect(swatch(plan, s.swap, 'Accent')).toBe(swatch(plan, s.main, 'Accent'));
    }
  });

  it('holds no set in one role for more than 3 songs', () => {
    for (const role of ['main', 'break', 'swap'] as const) {
      for (const n of tally(plan.songs.map((s) => s[role]))) expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('never gives neighbouring songs the same Main', () => {
    plan.songs.slice(1).forEach((s, i) => expect(s.main).not.toBe(plan.songs[i]!.main));
  });

  it('keeps every Primary and Secondary complementary or analogous (P2)', () => {
    for (const set of plan.sets) {
      expect(goodPair(swatch(plan, set.id, 'Primary')!, swatch(plan, set.id, 'Secondary')!)).toBe(
        true,
      );
    }
  });

  it('opens on the first song’s Main', () => {
    expect(plan.sets[0]!.id).toBe(plan.songs[0]!.main);
  });
});

describe('20 songs', () => {
  const plan = colourSets(brief(`colours: [Green, Magenta]\nmood: aggressive\n${songs(20)}`));

  it('keeps Main, Break and Swap distinct and neighbouring Mains apart', () => {
    for (const s of plan.songs) expect(new Set([s.main, s.break, s.swap]).size).toBe(3);
    plan.songs.slice(1).forEach((s, i) => expect(s.main).not.toBe(plan.songs[i]!.main));
  });

  it('leads each Break with a contrast hue', () => {
    const contrast = contrastHues(
      brief(`colours: [Green, Magenta]\nmood: aggressive\n${songs(1)}`),
    );
    for (const s of plan.songs) expect(contrast).toContain(swatch(plan, s.break, 'Primary'));
  });

  // Known limit: 8 sets cannot give 20 songs a Break each under the cap of 3
  // (that needs 7 contrast-led sets), and a Main set with no exchanged partner
  // in the pool gets the nearest set as its Swap. The 3-per-role cap and the
  // exact Swap hold up to about 12 songs. This pins the overflow so a change
  // to it is deliberate.
  it('overflows the 3-per-role cap on Break and settles for a nearest Swap', () => {
    expect(Math.max(...tally(plan.songs.map((s) => s.break)))).toBeGreaterThan(3);
    const exact = plan.songs.filter(
      (s) =>
        swatch(plan, s.swap, 'Primary') === swatch(plan, s.main, 'Secondary') &&
        swatch(plan, s.swap, 'Secondary') === swatch(plan, s.main, 'Primary'),
    );
    expect(exact.length).toBeLessThan(plan.songs.length);
  });
});

describe('song colour overrides', () => {
  const text = `colours: [Green, Magenta]\nmood: aggressive\nsongs:\n  - name: S1\n    bpm: 120\n    colours: [Green, Magenta, Warm White]\n  - name: S2\n    bpm: 120\n  - name: S3\n    bpm: 120\n    colours: [Green, Magenta, Warm White]\n`;

  it('makes the override the song’s Main and derives Break and Swap', () => {
    const plan = colourSets(brief(text));
    const [s1] = plan.songs;
    expect([swatch(plan, s1!.main, 'Primary'), swatch(plan, s1!.main, 'Secondary')]).toEqual([
      'Green',
      'Magenta',
    ]);
    expect(swatch(plan, s1!.main, 'Accent')).toBe('Warm White');
    expect(swatch(plan, s1!.swap, 'Primary')).toBe('Magenta');
    expect(new Set([s1!.main, s1!.break, s1!.swap]).size).toBe(3);
  });

  it('reuses a set when two songs give the same colours', () => {
    const plan = colourSets(brief(text));
    expect(plan.songs[0]!.main).toBe(plan.songs[2]!.main);
  });

  it('notes a Main repeated on the next song', () => {
    const repeat = text.replace(
      '  - name: S2\n    bpm: 120\n',
      '  - name: S2\n    bpm: 120\n    colours: [Green, Magenta, Warm White]\n',
    );
    expect(colourSets(brief(repeat)).notes).toContain(
      'S2 repeats the Main of S1 (its brief colours)',
    );
  });

  it('adds only the override Main and Swap to the pool, and Break is an existing set', () => {
    const plain = colourSets(brief(text.replace(/ {4}colours: \[Green.*\n/g, '')));
    const plan = colourSets(brief(text));
    expect(plan.sets.length).toBe(plain.sets.length + 2);
    const breakName = setOf(plan, plan.songs[0]!.break).name;
    expect(plain.sets.map((s) => s.name)).toContain(breakName);
    const pool = new Set(plan.sets.map((s) => s.id));
    for (const s of plan.songs)
      for (const id of [s.main, s.break, s.swap]) expect(pool).toContain(id);
  });
});
