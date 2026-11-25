import { describe, expect, it } from 'vitest';
import { compilePlan } from './compile';
import { densityReport } from './density';
import { parsePlan } from './plan';
import { loadShow } from './show';
import { SongTimeline, TempoMap } from './timeline';
import type { TempoPoint } from './rpp';

/** A 4/4 song of `bars` bars with a marker at each section's bar. */
function songTimeline(points: TempoPoint[], bars: number, sections: [string, number][]) {
  const tempo = new TempoMap(points[0]!.bpm, points);
  const whole = new SongTimeline(tempo, { num: 4, den: 4 }, points, { start: 0, end: 1e4 });
  const at = (bar: number) => whole.timeAt({ bar, beat: 1 });
  return new SongTimeline(
    tempo,
    { num: 4, den: 4 },
    points,
    { start: 0, end: at(bars + 1) },
    sections.map(([name, bar]) => ({ name, time: at(bar) })),
  );
}

const LAYERS = ['look', 'movement', 'pulse', 'colourfx', 'hit'];
const TIERS = ['chill', 'drive', 'peak'];
// [name, Layer index, tags, colour swatch]
const SCENES: [string, number, string[], string?][] = [
  ...TIERS.flatMap((tier): [string, number, string[], string?][] => [
    [`${tier} red`, 0, [`tier:${tier}`], 'Red'],
    [`${tier} red too`, 0, [`tier:${tier}`], 'Red'],
    [`${tier} blue`, 0, [`tier:${tier}`], 'Blue'],
  ]),
  ['Dark', 0, ['utility']],
  ['Intro/Outro: Fade', 0, ['utility']],
  ['Fan', 1, ['dynamic']],
  ['Sway', 1, ['dynamic']],
  ['Pulse', 2, ['dynamic']],
  ['Step', 3, ['dynamic']],
  ...[
    'Full white',
    'Blinder',
    'Strobe',
    'Colour Primary',
    'Colour Split',
    'Punch beams',
    'Punch floor',
    'Side left',
    'Riser',
  ].map((name): [string, number, string[]] => [`Hit: ${name}`, 4, ['hit']]),
];
const SETS = ['Main', 'Break', 'Swap'];
const showJson = (opts: { sets?: boolean; tags?: boolean } = {}) =>
  JSON.stringify({
    layers: LAYERS.map((id) => ({ id, name: id })),
    scenes: SCENES.map(([name, layer, tags, swatch]) => ({
      id: name,
      name,
      layer: LAYERS[layer],
      tags: opts.tags === false ? [] : tags,
      rules: swatch ? [{ target: {}, intensity: 1, colour: { swatch } }] : [],
    })),
    colourSets:
      opts.sets === false
        ? []
        : SETS.map((name, i) => ({ id: name, name, note: { channel: 6, note: 12 + i } })),
    triggers: [
      ...LAYERS.map((_, i) => ({ channel: i + 1, note: 0, scene: 'Dark', mode: 'release' })),
      ...SCENES.map(([name, layer], i) => ({
        channel: layer + 1,
        note: 12 + i,
        scene: name,
        mode: layer === 4 ? 'flash' : 'go',
      })),
    ],
  });

/** The report for a plan body, on a song at `bpm` with a marker per section. */
function lint(
  body: string,
  sections: [string, number][] = [['verse', 1]],
  opts: { bpm?: number; bars?: number; sets?: boolean; tags?: boolean } = {},
) {
  const show = loadShow(showJson({ sets: opts.sets ?? false, tags: opts.tags }));
  const timeline = songTimeline(
    [{ time: 0, bpm: opts.bpm ?? 120, shape: 'square' }],
    opts.bars ?? 32,
    sections,
  );
  const plan = parsePlan(`song: Test\n${body}`);
  return densityReport(plan, compilePlan(plan, show, timeline), show, timeline);
}
const matching = (
  body: string,
  text: string,
  sections: [string, number][],
  opts: Parameters<typeof lint>[2] = {},
) => lint(body, sections, opts)!.warnings.filter((w) => w.includes(text));

describe('densityReport', () => {
  it('does not score an untagged Show', () => {
    expect(lint('', [['verse', 1]], { tags: false })).toBeUndefined();
  });

  const DRIVE = `cues:
  - at: 1
    look: drive red
    movement: Fan
patterns:
  - { from: 1, to: 8.4, every: 1 bar, scene: "Hit: Punch floor" }
`;

  it('scores a section 0 below the floor, 1 above the ceiling and 2 between', () => {
    // 8 bars of Drive: Movement 1 to 2, Hits 4 to 10, Pulse 0.5 to 2.
    const beats = '  - { from: 1.2, to: 8.4, every: 2 beats, scene: "Hit: Punch beams" }\n';
    const report = lint(DRIVE + beats, [['chorus', 1]], { bars: 8 })!;
    const [chorus] = report.sections;
    expect(chorus).toMatchObject({ name: 'chorus', bar: '1.1', tier: 'drive', bars: 8 });
    expect(chorus!.scores).toMatchObject({ movement: 2, pulse: 0, hits: 1 });
    expect(report.warnings).toContain(
      'Bar 1.1: chorus (Drive, 8 bars): below the Density floor: Pulse swaps 0 (min 1), Colour FX swaps 0 (min 1)',
    );
    expect(report.warnings).toContain(
      'Bar 1.1: chorus (Drive, 8 bars): above the Density ceiling: Hits 23 (max 10)',
    );
  });

  it('scales the bands to the section length, rounded outward', () => {
    // A 2-bar Peak section: Hits 8 to 16 per phrase is 2 to 4.
    const body = `cues:
  - { at: 1, look: peak red }
events:
  - { at: 1, scene: "Hit: Riser" }
`;
    const report = lint(body, [['drop', 1]], { bars: 2 })!;
    expect(report.warnings[0]).toContain('Hits 1 (min 2)');
  });

  it('asks no more of a section for part of a bar past a phrase', () => {
    // Peak per phrase: Looks 1 to 2, Hits 8 to 16.
    const peak = (looks: string, bars: number) =>
      lint(`cues:\n${looks}events:\n${hits(...Array<string>(8).fill('Riser'))}\n`, [['drop', 1]], {
        bars,
      })!.sections[0]!.scores;
    expect(peak('  - { at: 1, look: peak red }\n', 8.25)).toMatchObject({ look: 2, hits: 2 });
    const twice = '  - { at: 1, look: peak red }\n  - { at: 9, look: peak blue }\n';
    expect(peak(twice, 16.25)).toMatchObject({ look: 2 });
  });

  it('leaves a section without a tier unscored', () => {
    const report = lint('cues:\n  - { at: 1, look: Dark }\n')!;
    expect(report.sections[0]!.scores).toBeUndefined();
    expect(report.warnings).toEqual([]);
  });

  it('starts no section at a roll, endroll or hit marker', () => {
    const report = lint('', [
      ['verse', 1],
      ['roll', 3],
      ['endroll', 4],
      ['hit', 5],
      ['stop', 7],
    ])!;
    expect(report.sections.map((s) => s.name)).toEqual(['verse', 'stop']);
  });

  it('drops a section with no length and says so', () => {
    const report = lint('cues:\n  - { at: 1, look: drive red }\n', [
      ['verse', 1],
      ['chorus', 1],
    ])!;
    expect(report.sections.map((s) => s.name)).toEqual(['chorus']);
    expect(report.warnings).toContain(
      'Bar 1.1: verse starts at the same time as chorus, so it has no length and is not scored',
    );
  });

  it('says so when no marker starts a section', () => {
    expect(lint('', [])!.warnings).toEqual([
      'The Region has no section markers, so no section is scored for Density',
    ]);
  });

  it('counts no swap for a release, a re-fire or the end cue', () => {
    const body = `cues:
  - { at: 1, look: drive red, colourfx: Step }
  - { at: 3, colourfx: release }
  - { at: 5, look: drive red, colourfx: Step }
  - { at: 7, look: Dark }
end: { look: drive blue }
`;
    expect(lint(body)!.sections[0]!.counts).toMatchObject({ look: 2, colourfx: 1 });
  });

  it("counts each section's swaps, Hits and colour changes", () => {
    const body = `cues:
  - { at: 1, look: drive red, movement: Fan, pulse: Pulse }
  - { at: 3, movement: Sway }
  - { at: 9, look: peak blue, movement: Fan, colourfx: Step }
  - { at: 13, pulse: release, colourfx: release }
events:
  - { at: 2, scene: "Hit: Riser" }
  - { at: 9, scene: "Hit: Colour Primary" }
  - { at: 10, scene: "Hit: Punch floor" }
`;
    const report = lint(
      body,
      [
        ['verse', 1],
        ['chorus', 9],
      ],
      { bars: 16 },
    )!;
    expect(report.sections.map((s) => s.counts)).toEqual([
      { look: 1, movement: 2, pulse: 1, colourfx: 0, hits: 1, colour: 1 },
      { look: 1, movement: 1, pulse: 0, colourfx: 1, hits: 2, colour: 3 },
    ]);
  });

  it('flags a repeat with fewer elements than the pass before', () => {
    const body = `cues:
  - { at: 1, look: drive red, movement: Fan, pulse: Pulse }
  - { at: 9, look: drive blue, movement: Sway, pulse: release }
`;
    const sections: [string, number][] = [
      ['chorus1', 1],
      ['chorus2', 9],
    ];
    expect(matching(body, 'repeat', sections, { bars: 16 })).toEqual([
      'Bar 9.1: chorus2 (Drive, 8 bars): a repeat with fewer elements than chorus1 at 1.1: 2 Scenes against 3',
    ]);
  });

  it('compares a repeat with the pass before over the bars both have', () => {
    const body = `cues:
  - { at: 1, look: drive red, movement: Fan }
  - { at: 9, movement: Sway }
  - { at: 17, look: drive red, movement: Fan }
`;
    const sections: [string, number][] = [
      ['chorus1', 1],
      ['chorus2', 17],
    ];
    // An 8-bar repeat of a 16-bar chorus is not asked for the bar 9 swap.
    expect(matching(body, 'repeat', sections, { bars: 24 })).toEqual([]);
  });

  it('counts no reset Scene as an element of a repeat', () => {
    const body = `start: { movement: Fan }
cues:
  - { at: 1, look: drive red }
  - { at: 9, look: drive red, movement: release }
`;
    const sections: [string, number][] = [
      ['chorus1', 1],
      ['chorus2', 9],
    ];
    expect(matching(body, 'repeat', sections, { bars: 16 })).toEqual([]);
  });

  it('counts nothing for the reset, with or without start overrides', () => {
    const start = 'start: { look: chill red, movement: Fan }\n';
    for (const body of ['', start]) {
      expect(lint(body)!.sections[0]!.counts).toMatchObject({ look: 0, movement: 0, colour: 0 });
    }
  });

  it('counts colour changes from Looks, Colour FX, Colour Sets and colour Hits', () => {
    const body = `colourset: Main
cues:
  - { at: 1, look: drive red }
  - { at: 3, look: drive red too }
  - { at: 5, look: drive blue, colourfx: Step }
  - { at: 7, colourset: Break }
events:
  - { at: 2, scene: "Hit: Colour Primary" }
  - { at: 4, scene: "Hit: Punch floor" }
`;
    // Two Looks that recolour, 2 Colour Sets, 1 Colour FX swap and 1 colour Hit.
    const counts = lint(body, [['chorus', 1]], { sets: true })!.sections[0]!.counts;
    expect(counts).toMatchObject({ look: 3, colour: 6 });
  });

  it('asks for 4 to 6 Colour Set cues when the Show has Colour Sets', () => {
    const cues = (n: number) =>
      `cues:\n${Array.from({ length: n }, (_, i) => `  - { at: ${i + 1}, colourset: ${SETS[i % 3]} }`).join('\n')}\n`;
    const of = (n: number) => matching(cues(n), 'Colour Set', [], { sets: true });
    expect(of(3)).toEqual(['Bar 1.1: 3 Colour Set cues in the song, needs 4']);
    expect(of(4)).toEqual([]);
    expect(of(6)).toEqual([]);
    expect(of(7)).toEqual(['Bar 1.1: 7 Colour Set cues in the song, at most 6']);
    expect(matching('', 'Colour Set', [])).toEqual([]);
  });

  const hits = (...names: string[]) =>
    names.map((n, i) => `  - { at: ${i + 1}, scene: "Hit: ${n}" }`).join('\n');
  const FOUR = ['Punch beams', 'Punch floor', 'Side left', 'Riser'];

  it('asks for 4 Hit kinds in a Drive section and 6 in a Peak section', () => {
    const of = (tier: string, names: string[]) =>
      matching(
        `cues:\n  - { at: 1, look: ${tier} red }\nevents:\n${hits(...names)}\n`,
        'Hit kinds',
        [['chorus', 1]],
        { bars: 8 },
      );
    expect(of('drive', FOUR)).toEqual([]);
    expect(of('drive', FOUR.slice(1))).toEqual([
      'Bar 1.1: chorus (Drive, 8 bars): too few Hit kinds: 3, needs 4',
    ]);
    expect(of('peak', FOUR)).toEqual([
      'Bar 1.1: chorus (Peak, 8 bars): too few Hit kinds: 4, needs 6',
    ]);
    expect(of('chill', ['Riser'])).toEqual([]);
  });

  it('scales the Hit kinds down for a section shorter than a phrase, rounded down', () => {
    const of = (tier: string, bars: number) =>
      matching(
        `cues:\n  - { at: 1, look: ${tier} red }\nevents:\n${hits('Riser')}\n`,
        'Hit kinds',
        [['drop', 1]],
        { bars },
      );
    expect(of('drive', 4)).toEqual([
      'Bar 1.1: drop (Drive, 4 bars): too few Hit kinds: 1, needs 2',
    ]);
    expect(of('peak', 7)).toEqual(['Bar 1.1: drop (Peak, 7 bars): too few Hit kinds: 1, needs 5']);
    expect(of('peak', 1)).toEqual([]);
  });

  describe('full-area Hits', () => {
    const pattern = (every: string, to: string, scene = 'Full white') =>
      `patterns:\n  - { from: 1, to: ${to}, every: ${every}, scene: "Hit: ${scene}", length: 1/8 beat }\n`;
    const fast = (body: string, bpm: number) => matching(body, 'full-area', [['drop', 1]], { bpm });

    it('flags more than 3 starts a second', () => {
      expect(fast(pattern('1 beat', '3'), 200)).toEqual([
        'Bar 1.1: drop: more than 3 full-area Hits start within 1 s, for longer than a 2 beat burst',
      ]);
      expect(fast(pattern('1/4 beat', '2'), 120)).toHaveLength(1);
    });

    it('passes 3 starts a second', () => {
      expect(fast(pattern('1 beat', '3'), 180)).toEqual([]);
    });

    it('passes a burst of 2 beats or less', () => {
      expect(fast(pattern('1/2 beat', '1.3'), 200)).toEqual([]);
      expect(fast(pattern('1/4 beat', '1.3'), 140)).toEqual([]);
    });

    it('takes in Strobe and a colour on everything, not a partial Hit', () => {
      for (const scene of ['Strobe', 'Blinder', 'Colour Primary']) {
        expect(fast(pattern('1 beat', '3', scene), 200)).toHaveLength(1);
      }
      for (const scene of ['Colour Split', 'Punch beams']) {
        expect(fast(pattern('1 beat', '3', scene), 200)).toEqual([]);
      }
    });
  });
});
