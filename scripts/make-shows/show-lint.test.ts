import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { saveShowFile } from '../../src/engine/show-file';
import type { Colour, Rule, RuleTarget, Scene, Show, Trigger } from '../../src/shared/show';
import {
  failsStrict,
  grade,
  lintShow,
  parseSongSets,
  runLint,
  tierOf,
  type Score,
} from './show-lint';

const FRONT: RuleTarget = {
  roles: ['Wash'],
  zones: [{ row: 'Front', column: 'Centre', level: 'Overhead' }],
};
const BACK: RuleTarget = {
  roles: ['Wash'],
  zones: [{ row: 'Upstage', column: 'Centre', level: 'Overhead' }],
};
const FLOOR: RuleTarget = {
  roles: ['Wash'],
  zones: [{ row: 'Midstage', column: 'Centre', level: 'Floor' }],
};
const BEAMS: RuleTarget = { roles: ['Spot/Beam'] };

const sw = (
  swatch: 'Red' | 'Green' | 'Cyan' | 'Blue' | 'Amber' | 'Warm White' | 'White',
): Colour => ({
  swatch,
});
const set = (target: RuleTarget, intensity: number, colour: Colour): Rule => ({
  target,
  intensity,
  colour,
});

let counter = 0;
function scene(name: string, rules: Rule[], extra: Partial<Scene> = {}): Scene {
  counter += 1;
  return { id: `s${counter}`, name, tags: [], layer: 'look', fadeIn: 0, rules, ...extra };
}
const tiered = (tier: string, name: string, rules: Rule[], extra: Partial<Scene> = {}) =>
  scene(`${tier}: ${name}`, rules, { tags: [`tier:${tier}`], ...extra });

function show(scenes: Scene[], extra: Partial<Show> = {}, triggers: Trigger[] = []): Show {
  return {
    layers: [
      { id: 'look', name: 'Look' },
      { id: 'dyn', name: 'Dyn' },
      { id: 'dyn2', name: 'Dyn 2' },
      { id: 'dyn3', name: 'Dyn 3' },
    ],
    scenes,
    triggers,
    ...extra,
  };
}

const score = (s: Show, item: number): Score | null =>
  lintShow(s).items.find((i) => i.item === item)!.score;
const offenders = (s: Show, item: number): string[] =>
  lintShow(s).items.find((i) => i.item === item)!.offenders;

// A Look a pass needs: pale front, a hue behind.
const goodLook = (tier: string, name = 'Look', level = 0.6, extra: Partial<Scene> = {}) =>
  tiered(
    tier,
    name,
    [set(FRONT, Math.max(level, 0.5), sw('Warm White')), set(BACK, level, sw('Red'))],
    extra,
  );

describe('item 2: Colour Set pairs', () => {
  const slotLook = scene('slotted', [
    set(BACK, 1, { slot: 'Primary' } as never),
    set(FLOOR, 1, { slot: 'Secondary' } as never),
  ]);
  const colourSet = (name: string, primary: Colour, secondary: Colour) => ({
    id: name,
    name,
    fade: 1,
    colours: { Primary: primary, Secondary: secondary, Accent: sw('White') },
  });

  it('passes a complementary Colour Set', () => {
    const s = show([slotLook], { colourSets: [colourSet('Good', sw('Amber'), sw('Blue'))] });
    expect(score(s, 2)).toBe(2);
  });

  it('fails a near-miss Colour Set', () => {
    const s = show([slotLook], { colourSets: [colourSet('Miss', sw('Red'), sw('Green'))] });
    expect(score(s, 2)).toBe(0);
    expect(offenders(s, 2)).toEqual([
      expect.stringMatching(/^Colour Set Miss: Primary and Secondary 120 degrees/),
    ]);
  });

  it('is not scored when a set has a pale colour', () => {
    const s = show([slotLook], { colourSets: [colourSet('Pale', sw('White'), sw('Blue'))] });
    expect(score(s, 2)).toBeNull();
  });
});

describe('item 4: front is lit', () => {
  it('passes a front above the tier floor and fails one below', () => {
    expect(score(show([goodLook('groove')]), 4)).toBe(2);
    const dim = tiered('groove', 'Dim', [
      set(FRONT, 0.2, sw('Warm White')),
      set(BACK, 0.7, sw('Red')),
    ]);
    expect(score(show([dim]), 4)).toBe(0);
    expect(offenders(show([dim]), 4)[0]).toMatch(/^groove: Dim: front 20%/);
  });

  it('allows a dark front in a Silhouette', () => {
    const sil = tiered('chill', 'Silhouette', [set(BACK, 0.5, sw('Red'))]);
    expect(score(show([sil]), 4)).toBeNull();
  });

  it('uses the lower Chill floor', () => {
    const chill = tiered('chill', 'Soft', [set(FRONT, 0.4, sw('Warm White'))]);
    expect(score(show([chill]), 4)).toBe(2);
  });
});

describe('item 5: tiers climb', () => {
  it('passes a climb and fails a drop', () => {
    const up = show([goodLook('chill', 'a', 0.5), goodLook('groove', 'b', 0.7)]);
    expect(score(up, 5)).toBe(2);
    const down = show([goodLook('chill', 'a', 0.8), goodLook('groove', 'b', 0.6)]);
    expect(score(down, 5)).toBe(0);
  });

  it('scores a flat Peak against Drive as partial', () => {
    const flat = show([goodLook('drive', 'a', 0.9), goodLook('peak', 'b', 0.9)]);
    expect(score(flat, 5)).toBe(1);
    expect(offenders(flat, 5)[0]).toMatch(/^peak:/);
  });

  it('is not scored with one tier', () => {
    expect(score(show([goodLook('chill')]), 5)).toBeNull();
  });
});

describe('item 6: Chill negative space', () => {
  it('passes two parts and fails three', () => {
    expect(score(show([goodLook('chill', 'two', 0.5)]), 6)).toBe(2);
    const wide = tiered('chill', 'Wide', [
      set(FRONT, 0.4, sw('Warm White')),
      set(BACK, 0.4, sw('Red')),
      set(FLOOR, 0.4, sw('Red')),
    ]);
    expect(score(show([wide]), 6)).toBe(0);
    expect(offenders(show([wide]), 6)[0]).toMatch(/^chill: Wide: 3 parts lit/);
  });

  it('reads part tags in place of the Rules', () => {
    const tagged = goodLook('chill', 'Tagged', 0.5, {
      tags: ['tier:chill', 'part:front', 'part:back', 'part:floor'],
    });
    expect(score(show([tagged]), 6)).toBe(0);
  });
});

describe('item 8: Effect bands', () => {
  const move = (size: number, length: 4 | 8): Rule => ({
    target: BEAMS,
    movementEffect: { shape: 'Pan sweep', size, length, spread: 'In sync' },
  });

  it('passes a Groove Movement inside the band and fails one outside', () => {
    expect(score(show([tiered('groove', 'ok', [move(20, 4)])]), 8)).toBe(2);
    const big = tiered('groove', 'big', [move(40, 4)]);
    expect(score(show([big]), 8)).toBe(0);
    expect(offenders(show([big]), 8)[0]).toMatch(/^groove: big: movement size 40/);
  });

  it('fails a quarter-beat Pulse outside a Hit', () => {
    const fast = tiered('drive', 'fast', [
      {
        target: BEAMS,
        intensityEffect: { shape: 'Pulse', depth: 1, length: 0.25, spread: 'In sync' },
      },
    ]);
    expect(score(show([fast]), 8)).toBe(0);
  });
});

describe('item 9: stacking', () => {
  const pulse = (layer: string, name: string, tier: string) =>
    tiered(
      tier,
      name,
      [
        {
          target: BEAMS,
          intensityEffect: { shape: 'Pulse', depth: 0.5, length: 1, spread: 'In sync' },
        },
      ],
      { layer },
    );

  it('passes a Groove tier with three dynamic Layers, one Effect each', () => {
    const s = show([
      pulse('dyn', 'a', 'groove'),
      pulse('dyn2', 'b', 'groove'),
      pulse('dyn3', 'c', 'groove'),
    ]);
    expect(score(s, 9)).toBe(2);
  });

  it('fails a Chill Scene that runs three Effects at once', () => {
    const busy = tiered(
      'chill',
      'busy',
      [
        {
          target: BEAMS,
          intensityEffect: { shape: 'Pulse', depth: 0.5, length: 8, spread: 'In sync' },
          movementEffect: { shape: 'Fan', size: 12, length: 16, spread: 'In sync' },
          colourEffect: {
            shape: 'Fade',
            colours: [{ slot: 'Primary' }, { slot: 'Secondary' }],
            length: 16,
            spread: 'In sync',
          },
        },
      ],
      { layer: 'dyn' },
    );
    const s = show([busy]);
    expect(score(s, 9)).toBe(0);
    expect(offenders(s, 9)[0]).toMatch(
      /^chill: chill: busy runs 3 dynamic Effects at once \(cap 2\)/,
    );
  });
});

describe('item 10: fades', () => {
  it('passes a beat fade in the tier band and fails a long Peak fade', () => {
    const ok = goodLook('groove', 'ok', 0.6, { fadeIn: 2, fadeUnit: 'beats' });
    expect(score(show([ok]), 10)).toBe(2);
    const slow = goodLook('peak', 'slow', 1, { fadeIn: 3 });
    expect(score(show([slow]), 10)).toBe(0);
    expect(offenders(show([slow]), 10)[0]).toMatch(/^peak: slow: fade 6 beats/);
  });

  it('reads seconds at 120 BPM', () => {
    const chill = goodLook('chill', 'c', 0.45, { fadeIn: 3 });
    expect(score(show([chill]), 10)).toBe(2);
  });
});

describe('item 11: strobe', () => {
  const strobe = (rate: 'Slow' | 'Fast' | 0.25): Scene =>
    scene(`strobe ${rate}`, [{ target: FRONT, strobe: rate }]);

  it('passes Slow and fails Fast', () => {
    expect(score(show([strobe('Slow')]), 11)).toBe(2);
    const fast = strobe('Fast');
    expect(score(show([fast]), 11)).toBe(0);
    expect(offenders(show([fast]), 11)[0]).toMatch(/^strobe Fast: strobe 12 Hz/);
  });

  it('exempts a Scene only a Flash fires', () => {
    const fast = strobe('Fast');
    const s = show([fast], {}, [{ channel: 1, note: 1, scene: fast.id, mode: 'flash' }]);
    expect(score(s, 11)).toBe(2);
  });

  it('reads a beat-rate strobe at the song BPM', () => {
    const half = scene('half', [{ target: FRONT, strobe: 0.5 }]);
    // Once per half beat: 4 Hz at 120 BPM, 5.1 Hz at 154 BPM.
    expect(score(show([half]), 11)).toBe(2);
    const fast = lintShow(show([half]), 154);
    expect(fast.items.find((i) => i.item === 11)!.score).toBe(0);
    expect(fast.items.find((i) => i.item === 11)!.offenders[0]).toMatch(
      /strobe 5\.13 Hz at 154 BPM/,
    );
    expect(fast.bpm).toBe(154);
  });

  it('reads a square Effect at the song BPM', () => {
    const square = scene('sq', [
      {
        target: FRONT,
        intensityEffect: { shape: 'Square', length: 0.5, depth: 1, spread: 'In sync' },
      },
    ]);
    expect(score(show([square]), 11)).toBe(2);
    expect(lintShow(show([square]), 154).items.find((i) => i.item === 11)!.score).toBe(0);
  });

  it('applies the Show strobe cap to a Go Scene', () => {
    expect(score(show([strobe('Fast')], { strobeCap: 4 }), 11)).toBe(2);
    expect(score(show([strobe('Fast')], { strobeCap: 8 }), 11)).toBe(0);
  });

  it('fails a quarter-beat Square Effect', () => {
    const sq = scene('square', [
      {
        target: BEAMS,
        intensityEffect: { shape: 'Square', depth: 1, length: 0.25, spread: 'In sync' },
      },
    ]);
    expect(score(show([sq]), 11)).toBe(0);
  });
});

describe('item 12: Base, Dark and still Movement', () => {
  const base = scene('Base', [set(FRONT, 0.8, sw('Warm White')), set(BACK, 0.8, sw('Warm White'))]);
  const dark = scene('Dark', [{ target: {}, intensity: 0 }]);

  it('passes a neutral Base with a Dark', () => {
    expect(score(show([base, dark], { baseLook: base.id }), 12)).toBe(2);
  });

  it('fails with no Base and with a coloured Base', () => {
    expect(score(show([base, dark]), 12)).toBe(0);
    const red = scene('Base', [set(FRONT, 0.8, sw('Red'))]);
    expect(score(show([red], { baseLook: red.id }), 12)).toBe(0);
    expect(offenders(show([red], { baseLook: red.id }), 12)).toContain(
      'Base: Base Look is not neutral and still',
    );
  });

  it('wants a still Movement in each tier that moves', () => {
    const moving = tiered('groove', 'Sweep', [
      {
        target: BEAMS,
        movementEffect: { shape: 'Pan sweep', size: 20, length: 4, spread: 'In sync' },
      },
    ]);
    const s = show([base, dark, moving], { baseLook: base.id });
    expect(offenders(s, 12)).toEqual(['groove: Sweep: no still Movement in groove']);
    const still = tiered('groove', 'Down', [{ target: BEAMS, direction: 'Down' }]);
    expect(score(show([base, dark, moving, still], { baseLook: base.id }), 12)).toBe(2);
  });
});

describe('Variety (item 17)', () => {
  const LAYERS = ['movement', 'pulse', 'colour-fx'];
  const tierNames = ['chill', 'groove', 'drive', 'peak'];
  const dyn = (layer: string, tier: string, i: number) =>
    tiered(
      tier,
      `${layer} ${i}`,
      [
        {
          target: BEAMS,
          movementEffect: { shape: 'Pan sweep', size: 20, length: 4, spread: 'In sync' },
        },
      ],
      { layer, tags: [`tier:${tier}`, 'dynamic'] },
    );
  const dynamics = (n: number) =>
    LAYERS.flatMap((layer) =>
      tierNames.flatMap((tier) => Array.from({ length: n }, (_, i) => dyn(layer, tier, i))),
    );
  const hits = (n: number): [Scene[], Trigger[]] => {
    const scenes = Array.from({ length: n }, (_, i) =>
      scene(`Hit ${i}`, [set(BACK, 1, sw('White'))], { layer: 'hit' }),
    );
    return [scenes, scenes.map((s) => ({ scene: s.id, mode: 'flash' }) as unknown as Trigger)];
  };
  const sets = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `set${i}`,
      name: `Set ${i}`,
      fade: 1,
      colours: { Primary: sw('Amber'), Secondary: sw('Blue'), Accent: sw('White') },
    }));
  const full = (perLayer = 6, hitCount = 15, setCount = 6) => {
    const [h, t] = hits(hitCount);
    return show([...dynamics(perLayer), ...h], { colourSets: sets(setCount) }, t);
  };
  const songs = [{ song: 'A', main: 'M', break: 'B', swap: 'S' }];
  const at = (s: Show) => lintShow(s, 120, songs).items.find((i) => i.item === 17)!;

  it('scores 2 with 6 Scenes per Layer per tier, 15 Hits and 6 Colour Sets', () => {
    expect(lintShow(full(), 120, songs).items.find((i) => i.item === 17)!.score).toBe(2);
  });

  it('scores 1 with 4 Scenes per Layer, and 0 with 3', () => {
    expect(at(full(4)).score).toBe(1);
    const s = full(3);
    expect(at(s).score).toBe(0);
    expect(offenders(s, 17)[0]).toMatch(/^movement in chill: 3 Scenes/);
  });

  it('lowers the score for too few Hits or Colour Sets', () => {
    expect(at(full(6, 14)).score).toBe(1);
    expect(at(full(6, 15, 5)).score).toBe(1);
  });

  it('lowers the score for a song whose Break equals its Main', () => {
    const bad = [{ song: 'A', main: 'M', break: 'M', swap: 'S' }];
    const r = lintShow(full(), 120, bad).items.find((i) => i.item === 17)!;
    expect(r.score).toBe(1);
    expect(r.offenders).toEqual(['A: Main, Break and Swap are not distinct']);
  });

  it('caps a generated Show at 1 when the Song sets table is unknown', () => {
    expect(score(full(), 17)).toBe(1);
  });

  it('counts a generated Layer with no Scenes as a shortfall', () => {
    const [h, t] = hits(15);
    const noPulse = dynamics(6).filter((s) => s.layer !== 'pulse');
    const s = show([...noPulse, ...h], { colourSets: sets(6) }, t);
    expect(lintShow(s, 120, songs).items.find((i) => i.item === 17)!.score).toBe(0);
    expect(offenders(s, 17)).toContain('pulse in chill: 0 Scenes, wants 6');
  });

  it('is not scored with no tiered dynamic Scene', () => {
    expect(score(show([goodLook('chill')]), 17)).toBeNull();
  });
});

describe('Song sets table', () => {
  it('reads the roles, without the note labels', () => {
    const md =
      '### Song sets\n\n| Song | Main | Break | Swap |\n|---|---|---|---|\n| A | Red (C4) | Teal (D4) | Blue (E4) |\n\n## Next\n';
    expect(parseSongSets(md)).toEqual([{ song: 'A', main: 'Red', break: 'Teal', swap: 'Blue' }]);
    expect(parseSongSets('# none')).toBeUndefined();
  });
});

describe('an untagged Show', () => {
  it('gets a partial score without crashing', () => {
    const plain = scene('Wash', [set(BACK, 1, sw('Red')), set(FLOOR, 1, sw('Cyan'))]);
    const report = lintShow(show([plain]));
    expect(report.scored).toBeLessThan(report.items.length);
    expect(report.items.find((i) => i.item === 5)!.score).toBeNull();
    expect(report.items.find((i) => i.item === 4)!.score).toBeNull();
    expect(report.total).toBeLessThanOrEqual(report.max);
  });

  it('copes with an empty Show', () => {
    expect(
      lintShow(show([]))
        .items.filter((i) => i.score !== null)
        .map((i) => i.item),
    ).toEqual([12]);
  });
});

describe('helpers', () => {
  it('reads a tier from a tag, a bare tier tag or a name prefix', () => {
    expect(tierOf(scene('x', [], { tags: ['tier:Drive'] }))).toBe('drive');
    expect(tierOf(scene('x', [], { tags: ['Peak'] }))).toBe('peak');
    expect(tierOf(scene('Chill: Red', []))).toBe('chill');
    expect(tierOf(scene('Red', []))).toBeUndefined();
  });

  it('grades by share of failures', () => {
    expect(grade(0, 4)).toBe(2);
    expect(grade(1, 4)).toBe(1);
    expect(grade(2, 4)).toBe(0);
    expect(grade(0, 0)).toBeNull();
  });
});

describe('strict mode', () => {
  const bad = show([tiered('groove', 'Red front', [set(BACK, 0.8, sw('Red'))])]);
  const file = saveShowFile(bad);

  it('exits 1 when item 4 or 11 scores 0, only with --strict', () => {
    expect(failsStrict(lintShow(bad))).toBe(true);
    expect(runLint(['x.lcshow', '--strict'], () => file).code).toBe(1);
    expect(runLint(['x.lcshow'], () => file).code).toBe(0);
  });

  it('exits 0 when those items pass', () => {
    const good = saveShowFile(show([goodLook('groove')]));
    expect(runLint(['x.lcshow', '--strict'], () => good).code).toBe(0);
  });

  it('prints each item, the Scene behind a failure and the total', () => {
    const { text } = runLint(['x.lcshow'], () => file);
    expect(text).toMatch(/ 4\. Front is lit.*: 0\/2/);
    expect(text).toContain('groove: Red front: front 0%, needs');
    expect(text).toMatch(/Total: \d+\/\d+/);
  });

  it('takes --bpm and says which BPM the strobe rates were read at', () => {
    expect(runLint(['x.lcshow'], () => file).text).toContain('read at 120 BPM');
    expect(runLint(['x.lcshow', '--bpm', '154'], () => file).text).toContain('read at 154 BPM');
    expect(() => runLint(['x.lcshow', '--bpm', 'fast'], () => file)).toThrow(/Usage/);
  });

  it('rejects a missing file argument', () => {
    expect(() => runLint([], () => file)).toThrow(/Usage/);
  });
});

describe('the committed Shows', () => {
  it.each(['Energy', 'Palette'])('lints %s without failing, whatever its score', (name) => {
    const json = readFileSync(new URL(`../../shows/${name}.lcshow`, import.meta.url), 'utf8');
    const { text } = runLint([`${name}.lcshow`], () => json);
    expect(text).toMatch(/Total: \d+\/\d+/);
  });
});
