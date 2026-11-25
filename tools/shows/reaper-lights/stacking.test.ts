import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './cli';
import { compilePlan } from './compile';
import { stackingWarnings, STACK_CAPS } from './stacking';
import { parsePlan } from './plan';
import { loadShow } from './show';
import type { TempoPoint } from './rpp';
import { SongTimeline, TempoMap } from './timeline';
import { renderLights } from './render';
import { writeLights } from './writer';

const LAYERS = ['look', 'movement', 'pulse', 'colourfx'];
// [id, name, layer index, note, tags]
const SCENES: [string, string, number, number, string[]][] = [
  ['base', 'Base', 0, 12, ['utility']],
  ['fade', 'Intro/Outro: Fade', 0, 15, ['utility']],
  ['chill', 'Chill: Look', 0, 24, ['look', 'tier:chill']],
  ['drive', 'Drive: Look', 0, 72, ['look', 'tier:drive']],
  ['peak', 'Peak: Look', 0, 96, ['look', 'tier:peak']],
  ['mdown', 'Chill: Down', 1, 24, ['tier:chill']],
  ['mfan', 'Drive: Fan', 1, 72, ['dynamic', 'tier:drive']],
  ['mstill', 'Drive: Still', 1, 73, ['tier:drive']],
  ['pulse', 'Drive: Pulse', 2, 72, ['dynamic', 'tier:drive']],
  ['cfx', 'Drive: Colour step', 3, 72, ['dynamic', 'tier:drive']],
  ['csway', 'Chill: Sway', 1, 25, ['dynamic', 'tier:chill']],
  ['cbreathe', 'Chill: Breathe', 2, 24, ['dynamic', 'tier:chill']],
  ['cdrift', 'Chill: Drift', 3, 24, ['dynamic', 'tier:chill']],
];
const showJson = {
  layers: LAYERS.map((id) => ({ id, name: id })),
  scenes: SCENES.map(([id, name, layer, , tags]) => ({ id, name, layer: LAYERS[layer], tags })),
  baseLook: 'base',
  triggers: [
    ...LAYERS.map((_, i) => ({ channel: i + 1, note: 0, scene: 'base', mode: 'release' })),
    ...SCENES.map(([scene, , layer, note]) => ({
      channel: (layer as number) + 1,
      note,
      scene,
      mode: 'go',
    })),
  ],
};
const show = loadShow(JSON.stringify(showJson));

// 120 BPM in 4/4: a bar is 2 s. 20 bars. Chorus1 is bar 5.
const points: TempoPoint[] = [{ time: 0, bpm: 120, shape: 'square' }];
const timeline = () =>
  new SongTimeline(new TempoMap(120, points), { num: 4, den: 4 }, points, { start: 0, end: 40 }, [
    { name: 'Verse1', time: 0 },
    { name: 'Chorus1', time: 8 },
  ]);
const lint = (yaml: string, s = show) => {
  const plan = parsePlan(yaml);
  return stackingWarnings(plan, compilePlan(plan, s, timeline()), s, timeline());
};

const OVER = `song: Test
cues:
  - at: Chorus1
    look: "Chill: Look"
    movement: "Chill: Sway"
    pulse: "Chill: Breathe"
    colourfx: "Chill: Drift"
`;

describe('stackingWarnings', () => {
  it('has the M4 caps', () => {
    expect(STACK_CAPS).toEqual({ chill: 2, groove: 3, drive: 3, peak: 4 });
  });

  it('warns on an over-stacked cue with the bar', () => {
    const [w, ...rest] = lint(OVER);
    expect(rest).toEqual([]);
    expect(w?.message).toMatch(/^Line 3: Bar 5\.1: 3 dynamic Layers in a Chill cue, the cap is 2/);
    expect(w?.message).toContain('Chill: Sway');
  });

  it('passes a cue within the cap', () => {
    const ok = OVER.replace('    colourfx: "Chill: Drift"\n', '');
    expect(lint(ok)).toEqual([]);
  });

  it('does not count a still Movement or a Look', () => {
    const still = OVER.replace('Chill: Sway', 'Chill: Down');
    expect(lint(still)).toEqual([]);
  });

  it('counts Layers held from an earlier cue', () => {
    const plan = `song: Test
cues:
  - at: Verse1
    movement: "Chill: Sway"
    pulse: "Chill: Breathe"
  - at: Chorus1
    look: "Chill: Look"
    colourfx: "Chill: Drift"
`;
    expect(lint(plan)).toHaveLength(1);
  });

  it('takes the tier from a cue that pulls a palette', () => {
    const plan = `song: Test
palette:
  chill:
    look: "Chill: Look"
    movement: "Chill: Sway"
    pulse: "Chill: Breathe"
    colourfx: "Chill: Drift"
cues:
  - at: Chorus1
    tier: chill
`;
    expect(lint(plan)[0]?.message).toMatch(/3 dynamic Layers in a Chill cue, the cap is 2/);
  });

  it('a release stops counting a Layer', () => {
    const plan = `${OVER}  - at: 9.1
    movement: release
    pulse: release
`;
    expect(lint(plan)).toHaveLength(1);
  });

  it('takes the tier from the Look when the cue has no tier', () => {
    const plan = `song: Test
cues:
  - at: Chorus1
    look: "Chill: Look"
    movement: "Drive: Fan"
    pulse: "Drive: Pulse"
    colourfx: "Drive: Colour step"
`;
    expect(lint(plan)[0]?.message).toMatch(/in a Chill cue, the cap is 2/);
  });

  it('skips a cue with no tier', () => {
    const plan = `song: Test
cues:
  - at: Chorus1
    movement: "Drive: Fan"
    pulse: "Drive: Pulse"
    colourfx: "Drive: Colour step"
`;
    expect(lint(plan)).toEqual([]);
  });

  it('gives no warning for a Show without tags', () => {
    const bare = loadShow(
      JSON.stringify({
        ...showJson,
        scenes: showJson.scenes.map(({ id, name, layer }) => ({ id, name, layer })),
      }),
    );
    expect(lint(OVER, bare)).toEqual([]);
  });
});

describe('render and write', () => {
  let dir: string;
  const rpp = () => join(dir, 'lantern.rpp');
  const planFile = () => join(dir, 'Lantern.lights.yaml');
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lights-stack-'));
    writeFileSync(rpp(), readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url)));
    writeFileSync(join(dir, 'show.json'), JSON.stringify(showJson));
    writeFileSync(planFile(), OVER.replace('song: Test', 'song: Lantern\nshow: show.json'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('render warns and still writes the page', () => {
    const out = run(['render', rpp(), planFile()]);
    expect(out).toMatch(/Wrote: .*Lantern\.lights\.html/);
    expect(out).toMatch(/Warning: Line 4: Bar 29\.1: 3 dynamic Layers in a Chill cue/);
  });

  it('write refuses an over-stacked plan', () => {
    expect(() => run(['write', rpp(), planFile()])).toThrow(/--allow-stack/);
    expect(() => writeLights({ rpp: rpp(), plan: planFile() })).toThrow(
      /over-stacked|--allow-stack/,
    );
  });

  it('write goes ahead with --allow-stack and says what it allowed', () => {
    const out = run(['write', rpp(), planFile(), '--allow-stack']);
    expect(out).toMatch(/Warning: Line 4: Bar 29\.1/);
    expect(out).toMatch(/Wrote: /);
  });

  it('a clean plan prints no warning', () => {
    writeFileSync(planFile(), 'song: Lantern\nshow: show.json\n');
    expect(run(['render', rpp(), planFile()])).not.toMatch(/Warning/);
    expect(renderLights({ rpp: rpp(), plan: planFile() })).toMatch(/\.html$/);
  });
});
