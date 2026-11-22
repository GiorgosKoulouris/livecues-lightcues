import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadShowFile } from '../../src/engine/show-file';
import { loadVenueFile } from '../../src/engine/venue-file';
import {
  isSlotRef,
  NO_EFFECT,
  ruleTargets,
  validateShow,
  type RuleColour,
  type Scene,
  type Show,
} from '../../src/shared/show';
import { fitSpeedLimit } from '../../src/shared/speed-limit';
import { DEFAULT_RIG, loadBrief, type Brief, type VenueSummary } from './brief';
import { stepFlashLength, stepMovement } from './dynamics';
import { generate, generateFiles } from './generate';
import { flashHz, targetCovers, TIER_BANDS, TIERS, type Tier } from './rules';
import { dynamicKinds, lintShow, tierOf } from './show-lint';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const sample = loadBrief(fileURLToPath(fixture('sample-brief.yaml')));
const files = generateFiles(sample.brief, sample.venue);
const show = loadShowFile(files.show);
const scene = (id: string): Scene => show.scenes.find((s) => s.id === id)!;
const onLayer = (s: Show, layer: string): Scene[] => s.scenes.filter((sc) => sc.layer === layer);
const DYNAMIC = ['movement', 'pulse', 'colour-fx'];
const effectGroup = {
  role: 'Effect',
  zone: { row: 'Upstage', column: 'Centre', level: 'Overhead' },
  count: 2,
  moving: 0,
} as const;
/** Every part, and prism and gobo beams. */
const FULL_RIG: VenueSummary = {
  ...DEFAULT_RIG,
  groups: [...DEFAULT_RIG.groups, effectGroup],
  prism: true,
  gobo: true,
};
const full = generate(sample.brief, FULL_RIG);
const inTier = (scenes: Scene[], tier: Tier): Scene[] => scenes.filter((s) => tierOf(s) === tier);
const briefAt = (bpm: number, extra: Partial<Brief> = {}): Brief => ({
  ...sample.brief,
  ...extra,
  songs: sample.brief.songs.map((song) => ({ ...song, bpm })),
});

describe('Movement, Pulse and Colour FX', () => {
  it('has a Layer and channel for each, and releases the three on note 0', () => {
    expect(show.layers.map((l) => l.id)).toEqual(['look', 'movement', 'pulse', 'colour-fx', 'hit']);
    const channels: [string, number][] = [
      ['movement', 2],
      ['pulse', 3],
      ['colour-fx', 4],
      ['hit', 5],
    ];
    for (const [layer, channel] of channels) {
      const scenes = onLayer(show, layer);
      expect(scenes.length).toBeGreaterThan(0);
      const triggers = show.triggers.filter((t) => scenes.some((s) => s.id === t.scene));
      for (const t of triggers) expect(t.channel).toBe(channel);
    }
    const releases = show.triggers.filter((t) => t.mode === 'release' && t.channel > 1);
    expect(releases.map((t) => [t.channel, t.note])).toEqual([
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
  });

  it('leaves Movement off front washes that are movers (M1)', () => {
    const patch = loadVenueFile(readFileSync(fixture('sample-venue.lcvenue'), 'utf8'));
    const movers = patch.fixtures.filter((f) => f.id.startsWith('front-mover'));
    expect(movers).toHaveLength(2);
    expect(sample.venue.movingFrontWashes).toBe(2);
    for (const s of onLayer(show, 'movement')) {
      for (const rule of s.rules) {
        expect(targetCovers(rule.target, 'front'), `${s.name} targets the front`).toBe(false);
        for (const mover of movers) {
          expect(ruleTargets(patch, mover, rule), `${s.name} aims at ${mover.id}`).toBe(false);
        }
      }
    }
    expect(files.cueSheet).toContain('2 front washes are movers.');
  });

  it('gives every tier at least 6 Scenes on Movement, Pulse and Colour FX', () => {
    for (const layer of DYNAMIC) {
      for (const tier of TIERS) {
        const n = inTier(onLayer(full.show, layer), tier).length;
        expect(n, `${tier} ${layer}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('puts Move+FX combos (intensity on the beams) and a still in each Movement tier', () => {
    for (const tier of TIERS) {
      const scenes = inTier(onLayer(full.show, 'movement'), tier);
      const combos = scenes.filter((s) => dynamicKinds(s) === 2);
      expect(combos.length, tier).toBeGreaterThanOrEqual(2);
      for (const c of combos) {
        const fx = c.rules.filter((r) => r.intensityEffect !== undefined);
        expect(fx.length).toBeGreaterThan(0);
        for (const r of fx) {
          expect(r.target.roles).toEqual(['Spot/Beam']);
        }
      }
      expect(scenes.filter((s) => !s.tags.includes('dynamic'))).toHaveLength(1);
    }
  });

  it('has Pulse and Colour FX Scenes on the front in every tier', () => {
    for (const layer of ['pulse', 'colour-fx']) {
      for (const tier of TIERS) {
        const scenes = inTier(onLayer(full.show, layer), tier);
        const front = scenes.filter((s) => s.rules.some((r) => targetCovers(r.target, 'front')));
        expect(front.length, `${tier} ${layer}`).toBeGreaterThan(0);
        for (const s of front) expect(s.tags).toContain('part:front');
      }
    }
  });

  it('has Pulse on every part and on everything', () => {
    for (const tier of TIERS) {
      const parts = new Set(
        inTier(onLayer(full.show, 'pulse'), tier).flatMap((s) =>
          s.tags.filter((t) => t.startsWith('part:')),
        ),
      );
      expect([...parts].sort(), tier).toEqual([
        'part:back',
        'part:beams',
        'part:floor',
        'part:front',
        'part:fx',
      ]);
      expect(
        inTier(onLayer(full.show, 'pulse'), tier).some(
          (s) => s.tags.filter((t) => t.startsWith('part:')).length === 5,
        ),
        tier,
      ).toBe(true);
    }
  });

  it('gives Colour FX slot colours only, never Rainbow (P7)', () => {
    const effects = onLayer(show, 'colour-fx').flatMap((s) => s.rules.map((r) => r.colourEffect));
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) {
      expect(effect).toBeDefined();
      expect(effect).not.toBe(NO_EFFECT);
      const e = effect as { shape: string; colours?: RuleColour[] };
      expect(['Step', 'Fade']).toContain(e.shape);
      expect(e.colours!.every(isSlotRef)).toBe(true);
    }
  });

  it('keeps lengths and sizes inside the tier bands (T3, M2)', () => {
    for (const s of onLayer(show, 'movement')) {
      const band = TIER_BANDS[tierOf(s)!];
      for (const r of s.rules) {
        const e = r.movementEffect;
        if (e === undefined || e === NO_EFFECT) continue;
        expect(e.length).toBeGreaterThanOrEqual(band.movementLength[0]);
        expect(e.length).toBeLessThanOrEqual(band.movementLength[1]);
        expect(e.size).toBeGreaterThanOrEqual(band.movementSize[0]);
        expect(e.size).toBeLessThanOrEqual(band.movementSize[1]);
      }
    }
    for (const s of onLayer(show, 'pulse')) {
      const band = TIER_BANDS[tierOf(s)!];
      for (const r of s.rules) {
        const e = r.intensityEffect;
        if (e === undefined || e === NO_EFFECT) continue;
        expect(e.length).toBeGreaterThanOrEqual(band.intensityLength[0]);
        expect(e.length).toBeLessThanOrEqual(band.intensityLength[1]);
      }
    }
  });

  it('gives every tier a still option that runs no Effect (M5)', () => {
    for (const tier of TIERS) {
      const still = scene(`movement-${tier}-still`);
      expect(still.tags).not.toContain('dynamic');
      expect(still.rules.every((r) => r.movementEffect === NO_EFFECT)).toBe(true);
    }
  });

  it('uses symmetry by tier (M3)', () => {
    const spreads = (tier: Tier) =>
      onLayer(show, 'movement')
        .filter((s) => tierOf(s) === tier)
        .flatMap((s) => s.rules.map((r) => r.movementEffect))
        .flatMap((e) => (e === undefined || e === NO_EFFECT ? [] : [e.spread]));
    for (const spread of spreads('chill')) expect(['In sync', 'Left→Right']).toContain(spread);
    for (const spread of spreads('groove')) expect(['Left→Right', 'Mirrored']).toContain(spread);
    for (const spread of spreads('peak')) expect(['Mirrored', 'Edges→Centre']).toContain(spread);
  });

  it('keeps every Scene inside its tier stacking cap (M4: Chill 2, Groove 3, Drive 3, Peak 4)', () => {
    expect(TIERS.map((t) => TIER_BANDS[t].maxDynamic)).toEqual([2, 3, 3, 4]);
    for (const s of full.show.scenes.filter((sc) => DYNAMIC.includes(sc.layer))) {
      expect(dynamicKinds(s), s.name).toBeLessThanOrEqual(TIER_BANDS[tierOf(s)!].maxDynamic);
    }
    expect(lintShow(full.show).items.find((i) => i.item === 9)?.score).toBe(2);
  });

  it('lists the recommended combos per section type in the Cue Sheet', () => {
    expect(files.cueSheet).toContain('## Recommended combos');
    for (const row of ['| Chorus |', '| Last chorus, drop |', '| Break, breakdown |', '| Stop |']) {
      expect(files.cueSheet).toContain(row);
    }
    expect(files.cueSheet).toContain('Drive: Fan or Drive: Texture');
    expect(files.cueSheet).toContain(
      'Keep to the cap for the tier: Chill 2 dynamic Layers, Groove 3, Drive 3, Peak 4.',
    );
  });

  it('drops options the rig has no parts for', () => {
    const rig = {
      ...DEFAULT_RIG,
      groups: DEFAULT_RIG.groups.filter((g) => g.role !== 'Spot/Beam'),
    };
    const g = generate(sample.brief, rig);
    expect(validateShow(g.show)).toEqual([]);
    const dynamic = g.show.scenes.filter((s) => DYNAMIC.includes(s.layer));
    expect(dynamic.length).toBeGreaterThan(0);
    for (const s of dynamic) expect(s.tags).not.toContain('part:beams');
    expect(g.show.scenes.some((s) => s.id === 'pulse-drive-beam-square')).toBe(false);
    expect(g.show.scenes.some((s) => s.id === 'movement-peak-fan-pulse')).toBe(false);
  });

  it('builds only Pulse and Colour FX for a rig with only front washes', () => {
    const rig = {
      ...DEFAULT_RIG,
      groups: DEFAULT_RIG.groups.filter((g) => g.zone.row === 'Front'),
    };
    const g = generate(sample.brief, rig);
    expect(validateShow(g.show)).toEqual([]);
    expect(g.show.layers.map((l) => l.id)).toEqual(['look', 'pulse', 'colour-fx', 'hit']);
    for (const s of g.show.scenes.filter((sc) => DYNAMIC.includes(sc.layer))) {
      expect(s.tags.filter((t) => t.startsWith('part:'))).toEqual(['part:front']);
    }
    expect(g.show.triggers.filter((t) => t.channel > 1 && t.mode === 'release')).toHaveLength(2);
  });
});

describe('Hits', () => {
  const hits = onLayer(show, 'hit');

  it('has the Core Hits (R5, R6, L4)', () => {
    expect(hits.slice(0, 5).map((s) => s.name)).toEqual([
      'Hit: Blinder',
      'Hit: Strobe',
      'Hit: Blackout',
      'Hit: Riser',
      'Hit: Roll',
    ]);
  });

  it('has at least 18 Hits with all parts and prism and gobo beams', () => {
    const all = onLayer(full.show, 'hit');
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(validateShow(full.show)).toEqual([]);
  });

  it('has a punch per part, left, right, front and back, in white', () => {
    const names = onLayer(full.show, 'hit').map((s) => s.name);
    for (const n of ['front', 'back', 'floor', 'beams', 'fx'].map((p) => `Hit: Punch ${p}`)) {
      expect(names).toContain(n);
    }
    for (const n of ['left', 'right', 'front', 'back'].map((p) => `Hit: Side ${p}`)) {
      expect(names).toContain(n);
    }
  });

  it('makes Colour hits from slots, so they follow the held Colour Set', () => {
    const colour = onLayer(full.show, 'hit').filter((s) => s.tags.includes('kind:colour'));
    expect(colour.length).toBeGreaterThanOrEqual(3);
    for (const s of colour) {
      for (const r of s.rules) expect(isSlotRef(r.colour as RuleColour), s.name).toBe(true);
    }
    const slots = colour.flatMap((s) => s.rules.map((r) => (r.colour as { slot: string }).slot));
    expect(new Set(slots)).toEqual(new Set(['Primary', 'Secondary', 'Accent']));
  });

  it('keeps Hits Flash-only and short: no Effect longer than 2 beats except the Riser', () => {
    for (const s of onLayer(full.show, 'hit')) {
      if (s.id === 'hit-riser') continue;
      for (const r of s.rules) {
        const e = r.intensityEffect;
        if (e !== undefined && e !== NO_EFFECT) expect(e.length, s.name).toBeLessThanOrEqual(2);
      }
    }
  });

  it('omits the Prism and Gobo Hits, and says so, when the venue has neither', () => {
    const none = generate(sample.brief, { ...FULL_RIG, prism: false, gobo: false });
    const hitIds = onLayer(none.show, 'hit').map((s) => s.id);
    expect(hitIds.some((id) => /prism|gobo/.test(id))).toBe(false);
    expect(none.skipped.some((t) => /Prism and Gobo/.test(t))).toBe(true);
    expect(onLayer(none.show, 'hit').length).toBeGreaterThanOrEqual(15);
    const onlyGobo = generate(sample.brief, { ...FULL_RIG, prism: false });
    const ids = onLayer(onlyGobo.show, 'hit').map((s) => s.id);
    expect(ids).toContain('hit-gobo-beams');
    expect(ids).not.toContain('hit-prism-burst');
    expect(ids).not.toContain('hit-gobo-prism');
  });

  it('groups Hits by kind in the Cue Sheet', () => {
    const sheet = generateFiles(sample.brief, FULL_RIG).cueSheet;
    const at = (t: string) => sheet.indexOf(t);
    const heads = [
      '#### Core',
      '#### Target punches',
      '#### Side and depth',
      '#### Colour',
      '#### Prism and Gobo',
    ];
    for (const h of heads) expect(at(h), h).toBeGreaterThan(0);
    expect(heads.map(at)).toEqual([...heads.map(at)].sort((a, b) => a - b));
  });

  it('fires every Hit by Flash and nothing else', () => {
    for (const s of hits) {
      expect(show.triggers.filter((t) => t.scene === s.id).map((t) => t.mode)).toEqual(['flash']);
    }
    for (const t of show.triggers) {
      if (t.mode === 'flash') expect(hits.some((s) => s.id === t.scene)).toBe(true);
    }
  });

  it('keeps Hits out of the tiers and the stacking count', () => {
    for (const s of hits) {
      expect(tierOf(s)).toBeUndefined();
      expect(s.tags).not.toContain('dynamic');
    }
  });

  it('sets Blackout to everything off', () => {
    expect(scene('hit-blackout').rules).toEqual([{ target: {}, intensity: 0 }]);
  });
});

describe('Speed', () => {
  const fast = generate(briefAt(180), sample.venue).show;
  const slow = generate(briefAt(120), sample.venue).show;
  const goFired = (s: Show): Scene[] =>
    s.scenes.filter((sc) => s.triggers.some((t) => t.scene === sc.id && t.mode === 'go'));

  it('keeps movement under the Speed limit at 180 BPM', () => {
    let moving = 0;
    for (const s of fast.scenes) {
      for (const r of s.rules) {
        if (r.movementEffect === undefined || r.movementEffect === NO_EFFECT) continue;
        moving++;
        expect(fitSpeedLimit(r.movementEffect, 180).limited, s.name).toBe(false);
      }
    }
    expect(moving).toBeGreaterThan(0);
  });

  it('steps lengths up where the slow ones would be too fast', () => {
    const lengths = (s: Show) =>
      byId(s, 'movement-peak-mirror-circle').rules.map(
        (r) => (r.movementEffect as { length: number }).length,
      );
    expect(Math.min(...lengths(slow))).toBe(2);
    expect(Math.min(...lengths(fast))).toBeGreaterThan(2);
  });

  it('keeps every Scene fired by Go at or under the cap at 180 BPM', () => {
    for (const s of goFired(fast)) {
      for (const r of s.rules) {
        const { strobe, square } = flashHz(r, 180);
        expect(Math.min(strobe, fast.strobeCap!), s.name).toBeLessThanOrEqual(4);
        expect(square, s.name).toBeLessThanOrEqual(4);
      }
    }
    expect(lintShow(fast, 180).items.find((i) => i.item === 11)?.score).toBe(2);
  });

  it('steps square lengths up for a lower Strobe cap', () => {
    const low = generate(briefAt(150, { strobeHz: 2 }), sample.venue).show;
    for (const s of goFired(low)) {
      for (const r of s.rules) expect(flashHz(r, 150).square, s.name).toBeLessThanOrEqual(2);
    }
  });

  it('changes nothing for a slow song', () => {
    expect(generate(briefAt(100), sample.venue).show.scenes).toEqual(slow.scenes);
  });

  it('steps a movement Effect or a flash length only as far as needed', () => {
    const effect = { shape: 'Circle', size: 36, length: 2, spread: 'In sync' } as const;
    expect(stepMovement(effect, 120)).toEqual(effect);
    expect(stepMovement(effect, 200).length).toBe(4);
    expect(stepFlashLength(1, 120, 4)).toBe(1);
    expect(stepFlashLength(1, 300, 4)).toBe(2);
    expect(stepFlashLength(0.25, 120, 4)).toBe(0.5);
  });
});

function byId(s: Show, id: string): Scene {
  return s.scenes.find((sc) => sc.id === id)!;
}
