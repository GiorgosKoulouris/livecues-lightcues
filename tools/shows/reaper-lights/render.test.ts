import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from './cli';
import { compilePlan } from './compile';
import { parsePlan } from './plan';
import { htmlPathFor, renderTimeline } from './render';
import { loadShow } from './show';
import { SongTimeline, TempoMap } from './timeline';

const LAYERS = ['look', 'movement', 'pulse', 'colourfx', 'hit'];
const SCENES: [string, string, number, number, string, object[]][] = [
  ['base', 'Base: warm <white>', 1, 12, 'go', [{ colour: { swatch: 'Warm White' } }]],
  ['fade', 'Intro/Outro: Fade', 1, 15, 'go', []],
  ['drive', 'Drive: Red', 1, 72, 'go', [{ colour: { swatch: 'Red' } }]],
  ['down', 'Chill: Down', 2, 24, 'go', []],
  [
    'rainbow',
    'Chill: Rainbow',
    4,
    24,
    'go',
    [{ colourEffect: { colours: [{ swatch: 'Blue' }, { hue: 120, saturation: 1 }] } }],
  ],
  ['punch', 'Hit: Beam punch', 5, 25, 'flash', []],
];
const show = loadShow(
  JSON.stringify({
    layers: LAYERS.map((id) => ({ id, name: id === 'colourfx' ? 'Colour FX' : id })),
    scenes: SCENES.map(([id, name, ch, , , rules]) => ({
      id,
      name,
      layer: LAYERS[ch - 1],
      rules,
    })),
    baseLook: 'base',
    triggers: [
      ...LAYERS.map((_, i) => ({ channel: i + 1, note: 0, scene: 'base', mode: 'release' })),
      ...SCENES.map(([scene, , channel, note, mode]) => ({ channel, note, scene, mode })),
    ],
  }),
);

// 120 BPM in 4/4: a bar is 2 s. 12 bars.
const points = [{ time: 0, bpm: 120, shape: 'square' as const }];
const timeline = new SongTimeline(
  new TempoMap(120, points),
  { num: 4, den: 4 },
  points,
  { start: 0, end: 24 },
  [
    { name: 'Verse1', time: 0 },
    { name: 'Chorus1', time: 8 },
    { name: 'outro', time: 16 },
  ],
);
const plan = parsePlan(`song: Test
cues:
  - at: Chorus1
    look: "Drive: Red"
    colourfx: "Chill: Rainbow"
events:
  - at: 7.3
    scene: "Hit: Beam punch"
    length: 1 beat
`);
const html = () =>
  renderTimeline({ plan, events: compilePlan(plan, show, timeline), timeline, show });

describe('renderTimeline', () => {
  it('matches the snapshot', () => {
    expect(html()).toMatchSnapshot();
  });

  it('is one self-contained file', () => {
    const out = html();
    expect(out).toMatch(/^<!doctype html>/);
    expect(out).not.toMatch(/(src|href)="http/);
  });

  it('has a band per marker, a lane per Layer and a ruler', () => {
    const out = html();
    for (const name of ['Verse1', 'Chorus1', 'outro']) expect(out).toContain(`>${name}<`);
    for (const lane of ['look', 'movement', 'Colour FX', 'hit']) {
      expect(out).toContain(`data-lane="${lane}"`);
    }
    expect(out.match(/class="bar"/g)).toHaveLength(12);
  });

  it('escapes names and takes Scene colours from the Show', () => {
    const out = html();
    expect(out).toContain('Base: warm &lt;white&gt;');
    expect(out).not.toContain('<white>');
    expect(out).toContain('#e53935');
  });

  it('adds a band for the stretch before the first marker', () => {
    const late = new SongTimeline(
      new TempoMap(120, points),
      { num: 4, den: 4 },
      points,
      { start: 0, end: 24 },
      [{ name: 'Verse1', time: 4 }],
    );
    const out = renderTimeline({ plan, events: [], timeline: late, show });
    expect(out).toMatch(/class="band b0" style="left:0px;width:96px"><span>Start<\/span>/);
    expect(out).toMatch(/class="band b1" style="left:96px[^>]*><span>Verse1<\/span>/);
    expect(html()).not.toContain('>Start<');
  });

  it('leaves the Presets lane out when the Show has other Layers', () => {
    const withPresets = loadShow(
      JSON.stringify({
        layers: [
          { id: 'look', name: 'Look' },
          { id: 'presets', name: 'Presets' },
        ],
        scenes: [
          { id: 'a', name: 'A', layer: 'look' },
          { id: 'p', name: 'P', layer: 'presets' },
        ],
        triggers: [
          { channel: 1, note: 1, scene: 'a', mode: 'go' },
          { channel: 6, note: 1, scene: 'p', mode: 'go' },
        ],
      }),
    );
    const out = renderTimeline({ plan, events: [], timeline, show: withPresets });
    expect(out).toContain('data-lane="Look"');
    expect(out).not.toContain('data-lane="Presets"');
  });

  it('draws a Flash as a tick', () => {
    expect(html()).toContain('class="tick"');
  });
});

describe('lights:song render', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lights-render-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('names the page after the plan', () => {
    expect(htmlPathFor('/a/Lights/Lantern.lights.yaml')).toBe(
      join('/a/Lights', 'Lantern.lights.html'),
    );
  });

  it('puts <Song>.lights.html next to any plan name', () => {
    for (const name of ['Lantern.yaml', 'Lantern.yml', 'Lantern', 'Lantern.lights.yml']) {
      expect(htmlPathFor(`/a/Lights/${name}`)).toBe(join('/a/Lights', 'Lantern.lights.html'));
    }
  });

  it('writes the page next to the plan', () => {
    const rpp = join(dir, 'Project.rpp');
    const planPath = join(dir, 'Lantern.lights.yaml');
    writeFileSync(rpp, readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url)));
    writeFileSync(join(dir, 'show.json'), 'x');
    writeFileSync(planPath, 'song: Lantern\nshow: show.json\n');
    // A bad Show proves the command reads the plan's Show before it writes.
    expect(() => run(['render', rpp, planPath])).toThrow(/Show file/);
    writeFileSync(
      join(dir, 'show.json'),
      JSON.stringify({
        layers: [{ id: 'look', name: 'Look' }],
        scenes: [
          { id: 'a', name: 'Base: warm', layer: 'look' },
          { id: 'b', name: 'Intro/Outro: Fade', layer: 'look' },
        ],
        baseLook: 'a',
        triggers: [
          { channel: 1, note: 0, scene: 'a', mode: 'release' },
          { channel: 1, note: 12, scene: 'a', mode: 'go' },
          { channel: 1, note: 15, scene: 'b', mode: 'go' },
        ],
      }),
    );
    const out = run(['render', rpp, planPath]);
    expect(out).toBe(`Wrote: ${join(dir, 'Lantern.lights.html')}`);
    expect(readFileSync(join(dir, 'Lantern.lights.html'), 'utf8')).toContain('<title>Lantern');
    expect(() => run(['render'])).toThrow(/Usage/);
  });
});

describe('Density in render', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lights-density-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const fixture = fileURLToPath(new URL('fixtures/lantern.rpp', import.meta.url));

  const render = (tags: string[]) => {
    const showPath = join(dir, 'show.lcshow');
    writeFileSync(
      showPath,
      JSON.stringify({
        layers: [{ id: 'look', name: 'Look' }],
        scenes: [
          { id: 'drive', name: 'Drive: Red', layer: 'look', tags },
          { id: 'fade', name: 'Intro/Outro: Fade', layer: 'look' },
        ],
        triggers: [
          { channel: 1, note: 72, scene: 'drive', mode: 'go' },
          { channel: 1, note: 15, scene: 'fade', mode: 'go' },
        ],
      }),
    );
    const planPath = join(dir, 'Lantern.lights.yaml');
    writeFileSync(
      planPath,
      `song: Lantern\nshow: show.lcshow\ncues:\n  - { at: Chorus1, look: "Drive: Red" }\n`,
    );
    const out = run(['render', fixture, planPath]);
    return { out, html: readFileSync(join(dir, 'Lantern.lights.html'), 'utf8') };
  };

  it('prints Density warnings and draws a Density row for a tagged Show', () => {
    const { out, html } = render(['tier:drive']);
    expect(out).toMatch(
      /^Warning: Bar [\d.]+: Chorus1 \(Drive, .* bars\): below the Density floor/m,
    );
    expect(html).toContain('data-lane="Density"');
    expect(html).toContain('>Drive: Look changes↓');
    expect(out).toContain('Wrote:');
  });

  it('adds neither for an untagged Show', () => {
    const { out, html } = render([]);
    expect(out).not.toContain('Warning:');
    expect(html).not.toContain('data-lane="Density"');
  });
});
