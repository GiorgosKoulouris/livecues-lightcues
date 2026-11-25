import { describe, expect, it } from 'vitest';
import type { Tier } from '../make-shows/rules';
import type { MidiEvent } from './compile';
import { COLOUR_SET_LAYER } from './compile';
import { sampleFiles } from '../make-shows/sample-fixture';
import { markedSong as song, offBand, useSongs, type SectionRow } from './generate-fixture';
import { loadShow } from './show';

const { generate, writeShow } = useSongs();

const BARS = 16;
const SAMPLE = loadShow(sampleFiles.show);
/** The Scenes a section's first `bars` bars run or fire at 120 BPM, Colour Sets apart. */
function scenes(events: MidiEvent[], bar: number, bars = BARS): Set<string> {
  const inside = events.filter(
    (e) => e.at.bar >= bar && e.at.bar < bar + bars && e.layer !== COLOUR_SET_LAYER,
  );
  return new Set(inside.flatMap((e) => (e.scene === undefined ? [] : [e.scene])));
}

const repeatWarnings = (warnings: string[]) => warnings.filter((w) => w.includes('fewer elements'));

/** The shape of each Movement Scene's Effect in the sample Show. */
const shapeOf = (name: string) => SAMPLE.scene(name)?.shape;

/** The Movement Scenes a section's first `bars` bars fire. */
const movements = (events: MidiEvent[], bar: number, bars = BARS) =>
  events
    .filter((e) => e.layer === 'movement' && e.at.bar >= bar && e.at.bar < bar + bars)
    .flatMap((e) => (e.scene === undefined ? [] : [e.scene]));

/** Three choruses between verses, the last one confirmed below Peak. */
const choruses = (tier: Tier = 'drive'): SectionRow[] => [
  [1, 'intro', 'chill'],
  [9, 'verse1', 'groove'],
  [17, 'chorus1', tier],
  [33, 'verse2', 'groove'],
  [41, 'chorus2', tier],
  [57, 'bridge', 'groove'],
  [65, 'chorus3', tier],
  [81, 'outro', 'chill'],
];

describe('lights:song generate: the last chorus', () => {
  it('goes Peak, whatever tier the sections file gives it', () => {
    const { output, report, plan } = generate(song(88, choruses()));
    expect(report.sections.map((s) => s.tier)).toEqual([
      'chill',
      'groove',
      'drive',
      'groove',
      'drive',
      'groove',
      'peak',
      'chill',
    ]);
    expect(output).toContain('Bar 65: chorus3 raised from Drive to Peak (the last chorus)');
    expect(plan.brief).toMatchObject({
      sections: expect.arrayContaining(['Bar 65: chorus3, Peak']),
    });
  });
});

describe('lights:song generate: the last chorus Hits', () => {
  const hits = (events: MidiEvent[], from: number, to: number) =>
    events.filter((e) => e.kind === 'flash' && e.at.bar >= from && e.at.bar < to);

  it('flashes both backbeats in the second half of each phrase', () => {
    const { events, report } = generate(song(88, choruses()));
    const at = hits(events, 65, 81).map((e) => `${e.at.bar}.${e.at.beat}`);
    for (const bar of [69, 70, 71, 72, 77, 78, 79, 80]) {
      expect(at, `bar ${bar}`).toEqual(expect.arrayContaining([`${bar}.2`, `${bar}.4`]));
    }
    expect(offBand(report, ['hits'])).toEqual([]);
  });

  it('keeps the prism Hits for itself', () => {
    const show = writeShow('prism', (raw) => {
      const punch = raw.scenes.find((s) => s.name === 'Hit: Punch beams')!;
      raw.scenes.push({ ...punch, id: 'hit-prism-burst', name: 'Hit: Prism burst' });
      raw.triggers.push({ channel: 5, note: 100, scene: 'hit-prism-burst', mode: 'flash' });
    });
    const { events } = generate({ ...song(88, choruses()), show });
    const bars = events.filter((e) => e.scene === 'Hit: Prism burst').map((e) => e.at.bar);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar).toBeGreaterThanOrEqual(65);
      expect(bar).toBeLessThan(81);
    }
  });
});

describe('lights:song generate: repeats', () => {
  it.each(['groove', 'drive', 'peak'] as const)(
    'gives each %s chorus more elements than the one before',
    (tier) => {
      const { events, report } = generate(song(88, choruses(tier)));
      const [first, second, last] = [17, 41, 65].map((bar) => scenes(events, bar).size);
      expect(second).toBeGreaterThan(first!);
      expect(last).toBeGreaterThan(second!);
      expect(repeatWarnings(report.warnings)).toEqual([]);
    },
  );

  const layouts: [string, number, number, SectionRow[]][] = [
    [
      'a 4-bar first chorus',
      48,
      120,
      [
        [1, 'verse', 'groove'],
        [9, 'chorus', 'peak'],
        [13, 'verse2', 'groove'],
        [21, 'chorus2', 'peak'],
        [37, 'outro', 'chill'],
      ],
    ],
    [
      'short choruses',
      22,
      120,
      [
        [1, 'verse', 'groove'],
        [9, 'chorus', 'peak'],
        [13, 'verse2', 'groove'],
        [17, 'chorus2', 'peak'],
      ],
    ],
  ];

  it.each(layouts)('gives each chorus more elements with %s', (_, bars, bpm, sections) => {
    const { events, report } = generate(song(bars, sections, bpm));
    const choruses = sections.flatMap(([bar, label], i) =>
      label.startsWith('chorus') ? [{ bar, bars: (sections[i + 1]?.[0] ?? bars + 1) - bar }] : [],
    );
    choruses.slice(1).forEach((next, i) => {
      const before = choruses[i]!;
      const shared = Math.min(next.bars, before.bars);
      expect(scenes(events, next.bar, shared).size, `bar ${next.bar}`).toBeGreaterThan(
        scenes(events, before.bar, shared).size,
      );
    });
    expect(repeatWarnings(report.warnings)).toEqual([]);
  });

  it('says which repeat could take no more elements than the pass before', () => {
    // The 10-bar last chorus has every Hit kind in use and no swap left under its ceilings.
    const { output, report } = generate(
      song(82, [
        [1, 'intro', 'chill'],
        [9, 'verse', 'groove'],
        [25, 'chorus', 'peak'],
        [33, 'verse2', 'groove'],
        [49, 'chorus2', 'peak'],
        [65, 'chorus3', 'peak'],
        [75, 'outro', 'chill'],
      ]),
    );
    expect(output).toContain(
      'Warning: Bar 65: chorus3 has no more elements than chorus2 at bar 49',
    );
    expect(repeatWarnings(report.warnings)).toEqual([]);
  });

  it('meets the colour floor where Looks share colours', () => {
    const { report } = generate(
      song(
        78,
        [
          [1, 'intro', 'chill'],
          [7, 'verse', 'chill'],
          [15, 'chorus', 'peak'],
          [19, 'verse2', 'chill'],
          [35, 'chorus2', 'peak'],
          [45, 'bridge', 'drive'],
          [49, 'chorus3', 'peak'],
          [73, 'outro', 'chill'],
        ],
        220,
      ),
    );
    expect(report.warnings.filter((w) => /Colour changes \d+ \(min/.test(w))).toEqual([]);
  });

  it('passes over colour Hits in the last chorus at its colour ceiling', () => {
    const { report } = generate(
      song(104, [
        [1, 'intro', 'chill'],
        [9, 'verse', 'groove'],
        [25, 'chorus', 'drive'],
        [41, 'verse2', 'groove'],
        [57, 'chorus2', 'drive'],
        [73, 'bridge', 'chill'],
        [81, 'chorus3', 'drive'],
        [97, 'outro', 'chill'],
      ]),
    );
    const over = report.warnings.filter((w) => /chorus3 .*Colour changes \d+ \(max/.test(w));
    expect(over).toEqual([]);
  });

  it('gives verse 2 more elements than verse 1', () => {
    const { events } = generate(song(88, choruses()));
    expect(scenes(events, 33, 8).size).toBeGreaterThan(scenes(events, 9, 8).size);
  });

  it("reuses the first pass's Look and Movement", () => {
    const { events } = generate(song(88, choruses()));
    const looks = (bar: number) =>
      events.filter((e) => e.layer === 'look' && e.at.bar >= bar && e.at.bar < bar + BARS);
    expect(looks(41).map((e) => e.scene)).toEqual(looks(17).map((e) => e.scene));
    expect(movements(events, 41)).toEqual(expect.arrayContaining(movements(events, 17)));
  });

  it("keeps the chorus's Movement family in the Peak last chorus", () => {
    const { events } = generate(song(88, choruses()));
    const families = new Set(movements(events, 17).map((name) => shapeOf(name)));
    for (const name of movements(events, 65)) expect(families, name).toContain(shapeOf(name));
  });

  it('gives no repeat warning whatever the lengths and tiers', () => {
    const lengths = [1, 2, 4, 7, 8, 12, 16, 24];
    for (const tier of ['chill', 'groove', 'drive', 'peak'] as const) {
      for (const a of lengths) {
        for (const b of lengths) {
          const sections: SectionRow[] = [
            [1, 'verse', tier],
            [1 + a, 'verse2', tier],
            [1 + a + b, 'verse3', tier],
          ];
          for (const bpm of [120, 200]) {
            const { report, stacking } = generate({
              ...song(a + 2 * b, sections, bpm),
              flags: ['--force'],
            });
            const at = `${tier} ${a}, ${b}, ${b} bars at ${bpm}`;
            expect(repeatWarnings(report.warnings), at).toEqual([]);
            expect(stacking, at).toEqual([]);
            expect(offBand(report, ['look', 'movement', 'pulse', 'colourfx', 'hits']), at).toEqual(
              [],
            );
          }
        }
      }
    }
  }, 60_000);
});
