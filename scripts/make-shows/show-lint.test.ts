import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { saveShowFile } from '../../src/engine/show-file';
import type { Colour, Rule, RuleTarget, Scene, Show, Trigger } from '../../src/shared/show';
import { failsStrict, grade, lintShow, runLint, tierOf, type Score } from './show-lint';

const FRONT: RuleTarget = {
  roles: ['Wash'],
  zones: [{ row: 'Front', column: 'Centre', level: 'Overhead' }],
};
const DOWNSTAGE: RuleTarget = {
  roles: ['Wash'],
  zones: [{ row: 'Downstage', column: 'Centre', level: 'Overhead' }],
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

describe('item 1: saturated hues per Look', () => {
  it('passes two hues and fails three, naming the Scene', () => {
    const two = scene('two', [set(BACK, 1, sw('Red')), set(FLOOR, 1, sw('Cyan'))]);
    const three = scene('three', [
      set(BACK, 1, sw('Red')),
      set(FLOOR, 1, sw('Green')),
      set(BEAMS, 1, sw('Blue')),
    ]);
    expect(score(show([two]), 1)).toBe(2);
    expect(score(show([three]), 1)).toBe(0);
    expect(offenders(show([three]), 1)[0]).toMatch(/^three: 3 saturated hues/);
  });

  it('counts hues within 15 degrees as one and ignores whites', () => {
    const look = scene('near', [
      set(BACK, 1, { hue: 0, saturation: 1 }),
      set(FLOOR, 1, { hue: 10, saturation: 1 }),
      set(BEAMS, 1, sw('White')),
    ]);
    expect(score(show([look]), 1)).toBe(2);
  });

  it('counts a slot colour as a hue and Accent as white', () => {
    const look = scene('slots', [
      set(BACK, 1, { slot: 'Primary' } as never),
      set(FLOOR, 1, { slot: 'Secondary' } as never),
      set(BEAMS, 1, { slot: 'Accent' } as never),
    ]);
    expect(score(show([look]), 1)).toBe(2);
  });
});

describe('item 2: hue pairs', () => {
  it('passes complementary and analogous pairs', () => {
    const comp = scene('comp', [set(BACK, 1, sw('Red')), set(FLOOR, 1, sw('Cyan'))]);
    const ana = scene('ana', [
      set(BACK, 1, { hue: 200, saturation: 1 }),
      set(FLOOR, 1, { hue: 230, saturation: 1 }),
    ]);
    expect(score(show([comp, ana]), 2)).toBe(2);
  });

  it('fails a near-miss pair', () => {
    const miss = scene('miss', [set(BACK, 1, sw('Red')), set(FLOOR, 1, sw('Green'))]);
    expect(score(show([miss]), 2)).toBe(0);
    expect(offenders(show([miss]), 2)[0]).toMatch(/^miss:/);
  });
});

describe('item 2: slot colours and Colour Sets', () => {
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

  it('passes a complementary Colour Set, and a Look that uses its slots', () => {
    const s = show([slotLook], { colourSets: [colourSet('Good', sw('Amber'), sw('Blue'))] });
    expect(score(s, 2)).toBe(2);
  });

  it('fails a near-miss Colour Set and the slot Look under it', () => {
    const s = show([slotLook], { colourSets: [colourSet('Miss', sw('Red'), sw('Green'))] });
    expect(score(s, 2)).toBe(0);
    expect(offenders(s, 2)).toEqual([
      expect.stringMatching(/^Colour Set Miss: Primary and Secondary 120 degrees/),
      expect.stringMatching(/^slotted: under Miss/),
    ]);
  });

  it('is not scored when sets are pale and no Look has plain hues', () => {
    const s = show([slotLook], { colourSets: [colourSet('Pale', sw('White'), sw('Blue'))] });
    expect(score(s, 2)).toBeNull();
  });
});

describe('item 3: pale front', () => {
  it('passes a pale front and fails a saturated one', () => {
    expect(score(show([goodLook('groove')]), 3)).toBe(2);
    const red = tiered('groove', 'Red front', [
      set(FRONT, 0.8, sw('Red')),
      set(BACK, 0.8, sw('Red')),
    ]);
    expect(score(show([red]), 3)).toBe(0);
    expect(offenders(show([red]), 3)[0]).toMatch(/^groove: Red front:/);
  });

  it('counts Downstage as front', () => {
    const red = tiered('groove', 'Downstage red', [set(DOWNSTAGE, 0.8, sw('Red'))]);
    expect(score(show([red]), 3)).toBe(0);
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

describe('item 7: dynamic Scenes leave the front alone', () => {
  const pan = (target: RuleTarget): Rule => ({
    target,
    direction: 'Down',
    movementEffect: { shape: 'Pan sweep', size: 20, length: 4, spread: 'In sync' },
  });

  it('passes a beam Movement and fails one that reaches the front', () => {
    expect(score(show([scene('beams', [pan(BEAMS)])]), 7)).toBe(2);
    const movers = scene('movers', [pan({ roles: ['Spot/Beam', 'Wash'] })]);
    expect(score(show([movers]), 7)).toBe(0);
    expect(offenders(show([movers]), 7)[0]).toMatch(/^movers:/);
  });

  it('exempts Hits', () => {
    const hit = scene('hit', [
      {
        target: FRONT,
        intensityEffect: { shape: 'Pulse', depth: 1, length: 1, spread: 'In sync' },
      },
    ]);
    const s = show([hit], {}, [{ channel: 1, note: 1, scene: hit.id, mode: 'flash' }]);
    expect(score(s, 7)).toBeNull();
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

  it('passes a Groove tier with two dynamic Layers', () => {
    expect(score(show([pulse('dyn', 'a', 'groove'), pulse('dyn2', 'b', 'groove')]), 9)).toBe(2);
  });

  it('fails a Chill tier that can stack two', () => {
    const s = show([pulse('dyn', 'a', 'chill'), pulse('dyn2', 'b', 'chill')]);
    expect(score(s, 9)).toBe(0);
    expect(offenders(s, 9)[0]).toMatch(/^chill: up to 2/);
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

describe('item 17: Looks per tier', () => {
  it('passes 8 Looks and fails 9', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => goodLook('chill', `look ${i}`, 0.5));
    expect(score(show(many(8)), 17)).toBe(2);
    const s = show(many(9));
    expect(score(s, 17)).toBe(0);
    expect(offenders(s, 17)[0]).toMatch(/9 Looks in chill/);
  });
});

describe('an untagged Show', () => {
  it('gets a partial score without crashing', () => {
    const plain = scene('Wash', [set(BACK, 1, sw('Red')), set(FLOOR, 1, sw('Cyan'))]);
    const report = lintShow(show([plain]));
    expect(report.scored).toBeLessThan(report.items.length);
    expect(report.items.find((i) => i.item === 1)!.score).toBe(2);
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
  const bad = show([tiered('groove', 'Red front', [set(FRONT, 0.8, sw('Red'))])]);
  const file = saveShowFile(bad);

  it('exits 1 when item 3, 4 or 11 scores 0, only with --strict', () => {
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
    expect(text).toMatch(/ 3\. Front light is pale.*: 0\/2/);
    expect(text).toContain('groove: Red front: saturated front');
    expect(text).toMatch(/Total: \d+\/\d+/);
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
