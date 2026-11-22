// The Show generator: a Brief in, a venue-independent Show and its Cue Sheet
// out. Built with the app's own models and `saveShowFile`, like `energy.ts`.
// `npm run show:generate -- <brief.yaml>` writes them beside the brief.
//
// Rules come from the catalogue in the show generator research (P1, I1, ...).
// Thresholds and the generator's own knobs are in `rules.ts`, shared with
// `show-lint.ts`, which scores what comes out. The rule groups are exported
// functions so each has its own test:
//   colour       `colourSets`         P1, P2, P5, P6
//   intensity    `levelOf`            I1, I2, T2
//   composition  `composeLook`        P3, P4, R1-R3, I4, I5
//   rig          `presentParts`       parts the venue can light
//
// Dynamics (Movement, Pulse, Colour FX, Hits) are built in `dynamics.ts`.
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { saveShowFile } from '../../src/engine/show-file';
import {
  type Colour,
  type Rule,
  type RuleColour,
  type Scene,
  type Show,
  type Slot,
  type Trigger,
} from '../../src/shared/show';
import { loadBrief, type Brief, type VenueSummary } from './brief';
import { colourSets, type ColourSetPlan } from './colour-sets';
import {
  slugOf,
  BASE_KELVIN,
  BASE_LEVELS,
  flashHz,
  inPart,
  partTarget,
  type PartCut,
  PARTS,
  REFERENCE_BPM,
  TIER_BASE,
  TIER_FADE_OUT_BEATS,
  TIER_BANDS,
  TIER_LEVELS,
  TIERS,
  tierFadeIn,
  type Part,
  type Tier,
} from './rules';
import {
  CH,
  DYNAMIC_LAYERS,
  dynamicEntries,
  dynamicReleases,
  layersWithScenes,
  LOOK_LAYER,
  type Entry,
} from './dynamics';
import { venueCheckReport, writeShowFiles } from './write';

// ---------------------------------------------------------------- colour

// ---------------------------------------------------------------- rig

/** The parts the venue has Fixtures for. */
export function presentParts(venue: VenueSummary): Part[] {
  return PARTS.filter((part) => venue.groups.some((g) => inPart(part, g.role, g.zone)));
}

// ---------------------------------------------------------------- intensity

/** I1, I2: the level a part is lit to in a tier's Looks. */
export const levelOf = (tier: Tier, part: Part): number => TIER_LEVELS[tier][part];

// ---------------------------------------------------------------- composition

/** Which slot each part takes, and the pair a split shares out. */
export type SlotMap = 'main' | 'swap' | 'accent-back' | 'accent-floor';
/** Left/right two-tone, or a front-to-back gradient. */
export type Split = 'lr' | 'fb';

export interface Recipe {
  name: string;
  parts: readonly Part[];
  map: SlotMap;
  split?: Split;
}

// R2, R3: the back carries the Primary and the floor the Secondary, the beams
// the Accent. The front takes slot colours like any part. The other maps swap
// the two, or put the Accent on the back or the floor.
const SLOT_MAPS: Record<SlotMap, Record<Part, Slot>> = {
  main: { front: 'Primary', back: 'Primary', floor: 'Secondary', beams: 'Accent', fx: 'Accent' },
  swap: { front: 'Secondary', back: 'Secondary', floor: 'Primary', beams: 'Accent', fx: 'Accent' },
  'accent-back': {
    front: 'Primary',
    back: 'Accent',
    floor: 'Secondary',
    beams: 'Primary',
    fx: 'Accent',
  },
  'accent-floor': {
    front: 'Primary',
    back: 'Primary',
    floor: 'Accent',
    beams: 'Secondary',
    fx: 'Accent',
  },
};
// The two slots a split shares out between its sides.
const SPLIT_PAIR: Record<SlotMap, readonly [Slot, Slot]> = {
  main: ['Primary', 'Secondary'],
  swap: ['Secondary', 'Primary'],
  'accent-back': ['Accent', 'Primary'],
  'accent-floor': ['Secondary', 'Accent'],
};

// I4, I5: what a tier lights, and how. Looks vary on three axes: the parts lit,
// the slot map per part, and from Groove up a left/right or front-to-back
// split. Chill lights the front and at most one more part; Groove up to four;
// Drive up to everything; Peak every part, since any other would leave one
// dark (I5). A rig without a part gets fewer Looks (`tierRecipes`).
export const RECIPES: Record<Tier, Recipe[]> = {
  chill: [
    { name: 'Glow', parts: ['front', 'back'], map: 'main' },
    { name: 'Glow Swap', parts: ['front', 'back'], map: 'swap' },
    { name: 'Floor Glow', parts: ['front', 'floor'], map: 'main' },
    { name: 'Floor Swap', parts: ['front', 'floor'], map: 'swap' },
    { name: 'Haze Beams', parts: ['front', 'beams'], map: 'main' },
    { name: 'Back Accent', parts: ['front', 'back'], map: 'accent-back' },
    { name: 'Front Wash', parts: ['front'], map: 'main' },
  ],
  groove: [
    { name: 'Steady', parts: ['front', 'back'], map: 'main' },
    { name: 'Colour', parts: ['front', 'back', 'floor'], map: 'main' },
    { name: 'Colour Swap', parts: ['front', 'back', 'floor'], map: 'swap' },
    { name: 'Beams', parts: ['front', 'back', 'beams'], map: 'accent-back' },
    { name: 'Full', parts: ['front', 'back', 'floor', 'beams'], map: 'main' },
    { name: 'Side Split', parts: ['front', 'back', 'floor', 'beams'], map: 'main', split: 'lr' },
    { name: 'Depth', parts: ['front', 'back', 'floor', 'beams'], map: 'main', split: 'fb' },
  ],
  drive: [
    { name: 'Wide', parts: ['front', 'back', 'floor'], map: 'main' },
    { name: 'Beams', parts: ['front', 'back', 'beams'], map: 'main' },
    { name: 'Chorus', parts: ['front', 'back', 'floor', 'beams'], map: 'main' },
    { name: 'Chorus Swap', parts: ['front', 'back', 'floor', 'beams'], map: 'swap' },
    { name: 'Hot Back', parts: ['front', 'back', 'floor', 'beams'], map: 'accent-back' },
    {
      name: 'Side Split',
      parts: ['front', 'back', 'floor', 'beams', 'fx'],
      map: 'main',
      split: 'lr',
    },
    { name: 'Depth', parts: ['front', 'back', 'floor', 'beams', 'fx'], map: 'swap', split: 'fb' },
  ],
  peak: [
    { name: 'Everything', parts: PARTS, map: 'main' },
    { name: 'Everything Swap', parts: PARTS, map: 'swap' },
    { name: 'Hot Back', parts: PARTS, map: 'accent-back' },
    { name: 'Hot Floor', parts: PARTS, map: 'accent-floor' },
    { name: 'Side Split', parts: PARTS, map: 'main', split: 'lr' },
    { name: 'Side Split Swap', parts: PARTS, map: 'swap', split: 'lr' },
    { name: 'Depth', parts: PARTS, map: 'main', split: 'fb' },
  ],
};

const slot = (s: Slot): RuleColour => ({ slot: s });
const kelvin = (k: number): Colour => ({ kelvin: k });

/** R2, R3: the slot colour a part takes under a slot map. */
export function colourOf(part: Part, map: SlotMap): RuleColour {
  return slot(SLOT_MAPS[map][part]);
}

// The columns and rows each side of a split covers. Centre goes with the left.
type Cut = PartCut;
const LEFT: Cut = { columns: ['Stage Left', 'Centre'] };
const RIGHT: Cut = { columns: ['Stage Right'] };
const FRONT_HALF: Cut = { rows: ['Front', 'Downstage'] };
const BACK_HALF: Cut = { rows: ['Midstage', 'Upstage'] };

/** Whether the rig has a Fixture in `part` inside `cut`. With no rig, it does. */
function hasFixtures(part: Part, cut: Cut, venue?: VenueSummary): boolean {
  return (
    venue === undefined ||
    venue.groups.some(
      (g) =>
        inPart(part, g.role, g.zone) &&
        (cut.columns === undefined || cut.columns.includes(g.zone.column)) &&
        (cut.rows === undefined || cut.rows.includes(g.zone.row)),
    )
  );
}

/** The sides a wash part takes in a split, with the slot each wears. Beams and fx take no split. */
function splitSides(
  part: Part,
  split: Split,
  [first, second]: readonly [Slot, Slot],
): { cut: Cut; slot: Slot }[] | undefined {
  if (part !== 'front' && part !== 'back' && part !== 'floor') return undefined;
  if (split === 'lr') {
    return [
      { cut: LEFT, slot: first },
      { cut: RIGHT, slot: second },
    ];
  }
  // Front-to-back: the front wash is the first slot, the back wash the second, the floor both.
  if (part === 'front') return [{ cut: {}, slot: first }];
  if (part === 'back') return [{ cut: {}, slot: second }];
  return [
    { cut: FRONT_HALF, slot: first },
    { cut: BACK_HALF, slot: second },
  ];
}

/** The Rules of a Look: each lit part at its tier level, in its slot colour, split if the recipe says. A side the rig has no Fixture for is left to the other. */
export function composeLook(
  tier: Tier,
  recipe: Pick<Recipe, 'parts' | 'map' | 'split'>,
  venue?: VenueSummary,
): Rule[] {
  const { parts, map, split } = recipe;
  const rule = (part: Part, colour: RuleColour, cut: Cut = {}): Rule => ({
    target: partTarget(part, cut),
    intensity: levelOf(tier, part),
    colour,
  });
  return parts.flatMap((part): Rule[] => {
    const sides = split ? splitSides(part, split, SPLIT_PAIR[map]) : undefined;
    if (sides === undefined) return [rule(part, colourOf(part, map))];
    const present = sides.filter((side) => hasFixtures(part, side.cut, venue));
    if (present.length === sides.length) return sides.map((s) => rule(part, slot(s.slot), s.cut));
    // One side is empty: the part takes the other side's colour whole.
    return [rule(part, slot((present[0] ?? sides[0]!).slot))];
  });
}

/** Whether a split Look still shows two tones on this rig. */
function splitShows(recipe: Recipe, venue?: VenueSummary): boolean {
  if (recipe.split === undefined) return true;
  const pair = SPLIT_PAIR[recipe.map];
  const tones = new Set<Slot>();
  for (const part of recipe.parts) {
    const sides = splitSides(part, recipe.split, pair);
    for (const side of sides ?? []) {
      if (hasFixtures(part, side.cut, venue)) tones.add(side.slot);
    }
  }
  return tones.size > 1 || [...tones].some((t) => !pair.includes(t));
}

/** A tier's Looks for a rig: the recipes cut to the parts present, empty, repeated and unsplittable ones dropped. */
export function tierRecipes(tier: Tier, present: readonly Part[], venue?: VenueSummary): Recipe[] {
  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const recipe of RECIPES[tier]) {
    const parts = recipe.parts.filter((p) => present.includes(p));
    const cut: Recipe = { ...recipe, parts };
    const key = `${parts.join()}|${recipe.map}|${recipe.split ?? ''}`;
    if (parts.length === 0 || seen.has(key) || !splitShows(cut, venue)) continue;
    seen.add(key);
    out.push(cut);
  }
  return out;
}

// ---------------------------------------------------------------- Scenes and notes

// The Layers and their channels are in `dynamics.ts`, with the Entry type.
export { CH, DYNAMIC_LAYERS, LOOK_LAYER, type Entry };

const UTILITY_BASE = 12;
const COLOUR_SET_BASE = 12;

export interface Generated {
  show: Show;
  entries: Entry[];
  colourSets: ColourSetPlan;
  /** Parts the venue has no Fixtures for, left out of every Scene. */
  omitted: Part[];
  /** Utilities left out because the rig could not light them. */
  skipped: string[];
  venue: VenueSummary;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function lookScene(tier: Tier, recipe: Recipe, venue: VenueSummary): Scene {
  return {
    id: `${tier}-${slugOf(recipe.name)}`,
    name: `${titleCase(tier)}: ${recipe.name}`,
    tags: [
      'look',
      `tier:${tier}`,
      ...recipe.parts.map((p) => `part:${p}`),
      ...(recipe.split ? [`split:${recipe.split}`] : []),
    ],
    layer: LOOK_LAYER.id,
    fadeIn: tierFadeIn(tier),
    fadeUnit: 'beats',
    fadeOut: TIER_FADE_OUT_BEATS[tier],
    fadeOutUnit: 'beats',
    rules: composeLook(tier, recipe, venue),
  };
}

interface UtilitySpec {
  id: string;
  name: string;
  about: string;
  fadeIn: number;
  fadeOut: number;
  // The Rules by part, in order. A level of 0 switches the part off.
  parts: [Part, number, RuleColour][];
}

const WARM = kelvin(3000);
const UTILITIES: UtilitySpec[] = [
  {
    id: 'base',
    name: 'Base',
    about: 'Neutral and still: warm white front and back. The safe look.',
    fadeIn: 2,
    fadeOut: 2,
    parts: [
      ['front', BASE_LEVELS.front, kelvin(BASE_KELVIN)],
      ['back', BASE_LEVELS.back, kelvin(BASE_KELVIN)],
    ],
  },
  { id: 'dark', name: 'Dark', about: 'Everything off.', fadeIn: 1, fadeOut: 1, parts: [] },
  {
    id: 'silhouette',
    name: 'Silhouette',
    about: 'Back and floor, the front dark.',
    fadeIn: 2,
    fadeOut: 2,
    parts: [
      ['front', 0, WARM],
      ['back', 0.8, slot('Primary')],
      ['floor', 0.5, slot('Secondary')],
    ],
  },
  {
    id: 'shafts',
    name: 'Shafts',
    about: 'White beams through haze, a low back and a soft front. For breakdowns.',
    fadeIn: 4,
    fadeOut: 4,
    parts: [
      ['front', 0.35, WARM],
      ['back', 0.25, slot('Primary')],
      ['beams', 0.8, slot('Accent')],
    ],
  },
  {
    id: 'walk-on',
    name: 'Walk-on',
    about: 'Back colour, the front low. The band walks on.',
    fadeIn: 4,
    fadeOut: 4,
    parts: [
      ['front', 0.2, WARM],
      ['back', 0.5, slot('Primary')],
    ],
  },
  {
    id: 'reveal',
    name: 'Reveal',
    about: 'The front rises slowly on the first vocal.',
    fadeIn: 8,
    fadeOut: 4,
    parts: [
      ['front', 0.6, kelvin(3400)],
      ['back', 0.4, slot('Primary')],
    ],
  },
  {
    id: 'bow',
    name: 'Bow',
    about: 'Full-stage white for the last hit and the bow.',
    fadeIn: 1,
    fadeOut: 4,
    parts: [],
  },
];

function utilityScene(spec: UtilitySpec, present: readonly Part[]): Scene | undefined {
  const parts = spec.parts.filter(([p]) => present.includes(p));
  const everything = spec.id === 'dark' || spec.id === 'bow';
  const lit = parts.filter(([, level]) => level > 0);
  if (!everything && lit.length === 0) return undefined;
  const rules: Rule[] = parts.map(([part, intensity, colour]) => ({
    target: partTarget(part),
    intensity,
    colour,
  }));
  if (spec.id === 'dark') rules.push({ target: {}, intensity: 0 });
  if (spec.id === 'bow') rules.push({ target: {}, intensity: 0.9, colour: { swatch: 'White' } });
  const tagged = spec.id === 'bow' ? present : lit.map(([p]) => p);
  return {
    id: spec.id,
    name: spec.name,
    tags: ['utility', ...tagged.map((p) => `part:${p}`)],
    layer: LOOK_LAYER.id,
    fadeIn: spec.fadeIn,
    fadeUnit: 'beats',
    fadeOut: spec.fadeOut,
    fadeOutUnit: 'beats',
    rules: spec.id === 'dark' ? [{ target: {}, intensity: 0 }] : rules,
  };
}

/** Looks and utilities for the Look Layer. */
function lookEntries(
  venue: VenueSummary,
  present: Part[],
): { entries: Entry[]; skipped: string[] } {
  const entries: Entry[] = [];
  const skipped: string[] = [];
  UTILITIES.forEach((spec, i) => {
    const scene = utilityScene(spec, present);
    if (scene === undefined)
      skipped.push(`${spec.name} (no ${spec.parts.map(([p]) => p).join(' or ')} in the rig)`);
    else
      entries.push({
        scene,
        channel: CH.look,
        note: UTILITY_BASE + i,
        mode: 'go',
        about: spec.about,
      });
  });
  for (const tier of TIERS) {
    tierRecipes(tier, present, venue).forEach((recipe, i) => {
      entries.push({
        scene: lookScene(tier, recipe, venue),
        channel: CH.look,
        note: TIER_BASE[tier] + i,
        mode: 'go',
        about: `${recipe.parts.join(', ')}${recipe.split ? `, ${recipe.split === 'lr' ? 'left/right split' : 'front-to-back split'}` : ''}${recipe.map === 'main' ? '' : `, ${recipe.map.replace('-', ' ')} map`}`,
      });
    });
  }
  return { entries, skipped };
}

// ---------------------------------------------------------------- the Show

/** The tempo the Show is built for: the fastest song's, where beat rates are quickest. */
export const fastestBpm = (brief: Brief): number => Math.max(...brief.songs.map((s) => s.bpm));

export function generate(brief: Brief, venue: VenueSummary): Generated {
  const present = presentParts(venue);
  const omitted = PARTS.filter((p) => !present.includes(p));
  const plan = colourSets(brief);
  const { entries: looks, skipped } = lookEntries(venue, present);
  const dynamic = dynamicEntries({ present, bpm: fastestBpm(brief), strobeHz: brief.strobeHz });
  const entries = [...looks, ...dynamic];
  const base = entries.some((e) => e.scene.id === 'base');
  const triggers: Trigger[] = [
    ...entries.map((e) => ({ channel: e.channel, note: e.note, scene: e.scene.id, mode: e.mode })),
    ...(base ? [{ channel: CH.look, note: 0, scene: 'base', mode: 'release' as const }] : []),
    ...dynamicReleases(entries),
  ].sort((a, b) => a.channel - b.channel || a.note - b.note);
  const show: Show = {
    layers: [LOOK_LAYER, ...layersWithScenes(entries)],
    scenes: entries.map((e) => e.scene),
    triggers,
    ...(base ? { baseLook: 'base' } : {}),
    colourSets: plan.sets.map((set, i) => ({
      ...set,
      note: { channel: CH.colourSets, note: COLOUR_SET_BASE + i },
    })),
    strobeCap: brief.strobeHz,
  };
  return { show, entries, colourSets: plan, omitted, skipped, venue };
}

// ---------------------------------------------------------------- Cue Sheet

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// The app's naming: C4 = note 60.
export const noteName = (note: number): string =>
  `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

const colourText = (c: Colour): string =>
  'swatch' in c ? c.swatch : 'kelvin' in c ? `${c.kelvin} K` : `${c.hue}°`;

const beatsOrSeconds = (value: number, unit: 'seconds' | 'beats' | undefined) =>
  `${value} ${unit === 'beats' ? (value === 1 ? 'beat' : 'beats') : 's'}`;

/** Scenes whose strobe or square Effect flashes faster than the cap at `bpm` (R6). */
export function flashingScenes(show: Show, bpm = REFERENCE_BPM): Scene[] {
  const cap = show.strobeCap ?? Infinity;
  return show.scenes.filter((scene) =>
    scene.rules.some((r) => {
      const { strobe, square } = flashHz(r, bpm);
      return strobe > cap || square > cap;
    }),
  );
}

function cueSheet(brief: Brief, g: Generated): string {
  const { show } = g;
  const sets = show.colourSets ?? [];
  const setRows = sets.map((set) => {
    const n = set.note?.note ?? 0;
    const c = set.colours;
    return `| ${noteName(n)} | ${n} | ${set.name} | ${colourText(c.Primary)} | ${colourText(c.Secondary)} | ${colourText(c.Accent)} | ${set.fade}s |`;
  });
  const setLabel = (id: string): string => {
    const set = sets.find((x) => x.id === id)!;
    return `${set.name} (${noteName(set.note?.note ?? 0)})`;
  };
  const songRows = g.colourSets.songs.map(
    (s) => `| ${s.song} | ${setLabel(s.main)} | ${setLabel(s.break)} | ${setLabel(s.swap)} |`,
  );
  const present = presentParts(g.venue);
  const rig =
    g.venue.source === 'venue'
      ? `the venue's ${g.venue.fixtures} Fixtures`
      : 'the default rig (front and back washes, beams, floor)';
  // The fastest song sets the pace: beat rates are quickest there.
  const bpm = fastestBpm(brief);
  const hitIds = new Set(g.entries.filter((e) => e.mode === 'flash').map((e) => e.scene.id));
  const flashing = flashingScenes(show, bpm);
  const goFlashing = flashing.filter((s) => !hitIds.has(s.id));
  const hitFlashing = flashing.filter((s) => hitIds.has(s.id));
  const left = [
    ...g.omitted.map((p) => `- Part left out: ${p}. The rig has no Fixtures for it.`),
    ...g.skipped.map((s) => `- Scene left out: ${s}.`),
    ...(g.venue.movingFrontWashes > 0
      ? [
          `- ${g.venue.movingFrontWashes} front wash${g.venue.movingFrontWashes === 1 ? ' is a mover' : 'es are movers'}. Movement, Pulse and Colour FX leave the front out, so they hold still.`,
        ]
      : []),
  ];
  const layerNames = layersWithScenes(g.entries).map(
    (l) => `${l.name} (channel ${g.entries.find((e) => e.scene.layer === l.id)!.channel})`,
  );
  const hasRelease = (channel: number) =>
    show.triggers.some((t) => t.mode === 'release' && t.channel === channel);
  const noteMap = (channel: number, title: string): string => {
    const rows = g.entries
      .filter((e) => e.channel === channel)
      .sort((a, b) => a.note - b.note)
      .map((e) => {
        const s = e.scene;
        const mode = { go: 'Go', flash: 'Flash', release: 'Release' }[e.mode];
        return `| ${noteName(e.note)} | ${e.note} | ${s.name} | ${mode} | ${beatsOrSeconds(s.fadeIn, s.fadeUnit)} | ${s.fadeOut === undefined ? 'snap' : beatsOrSeconds(s.fadeOut, s.fadeOutUnit)} | ${e.about} | ${s.tags.join(' ')} |`;
      });
    if (rows.length === 0) return '';
    const release = hasRelease(channel)
      ? [
          `| ${noteName(0)} | 0 | — | Release | | | ${channel === CH.look ? 'Release Look: back to the Base Look' : `Release ${title}: no ${title} Effect`} | |`,
        ]
      : [];
    return `### Channel ${channel}: ${title}

| Note | # | Scene | Mode | Fade in | Fade out | What it does | Tags |
|---|---|---|---|---|---|---|---|
${[...release, ...rows].join('\n')}
`;
  };
  const noteMaps = [
    [CH.look, 'Look'],
    [CH.movement, 'Movement'],
    [CH.pulse, 'Pulse'],
    [CH.colourfx, 'Colour FX'],
    [CH.hit, 'Hit'],
  ]
    .map(([channel, title]) => noteMap(channel as number, title as string))
    .filter((text) => text !== '')
    .join('\n');
  const ids = new Set(g.entries.map((e) => e.scene.id));
  const nameOf = new Map(g.entries.map((e) => [e.scene.id, e.scene.name]));
  // The names of the Scenes in `these` that the rig has, joined, or "none".
  const pick = (joiner: string, ...these: string[]): string =>
    these
      .filter((id) => ids.has(id))
      .map((id) => nameOf.get(id)!)
      .join(joiner) || 'none';
  const then = (text: string, suffix: string): string => (text === 'none' ? text : text + suffix);
  const combos = [
    [
      'Intro',
      'Walk-on, then Reveal on the vocal',
      pick(' or ', 'movement-chill-sway', 'movement-chill-still'),
      'none',
      'none',
    ],
    [
      'Verse 1',
      'Chill Looks',
      pick(' or ', 'movement-chill-sway', 'movement-chill-still'),
      'none (Chill allows 1 dynamic Layer)',
      'none',
    ],
    [
      'Verse 2+',
      'Groove Looks',
      pick(' or ', 'movement-groove-wave', 'movement-groove-still'),
      pick(' or ', 'colour-fx-groove-slow-fade'),
      'none',
    ],
    [
      'Pre-chorus, build',
      'Groove, then Drive',
      pick(' or ', 'movement-groove-still', 'movement-drive-still'),
      pick(' or ', 'pulse-drive-beat-pulse'),
      then(pick(' or ', 'hit-riser'), ' in the last bar'),
    ],
    [
      'Chorus',
      'Drive Looks',
      pick(' or ', 'movement-drive-fan', 'movement-drive-texture'),
      pick(' or ', 'pulse-drive-beat-pulse', 'pulse-drive-beam-square'),
      then(pick(' or ', 'hit-blinder'), ' on beat 1'),
    ],
    [
      'Last chorus, drop',
      'Peak Looks',
      pick(' or ', 'movement-peak-wide-fan', 'movement-peak-mirror-circle'),
      then(
        pick(' + ', 'pulse-peak-beat-pulse', 'colour-fx-peak-colour-step'),
        ' (3 Layers at most)',
      ),
      then(pick(' + ', 'hit-blinder', 'hit-strobe'), ' at the end'),
    ],
    [
      'Bridge',
      'Groove Looks, with the Break Colour Set',
      pick(' or ', 'movement-groove-wave'),
      pick(' or ', 'colour-fx-groove-slow-fade'),
      'none',
    ],
    [
      'Break, breakdown',
      pick(' or ', 'silhouette', 'shafts'),
      pick(' or ', 'movement-chill-still'),
      'none',
      'none',
    ],
    ['Solo', 'Drive Look minus one part', pick(' or ', 'movement-drive-fan'), 'none', 'none'],
    [
      'Outro',
      'Chill Looks, warm and low',
      pick(' or ', 'movement-chill-still'),
      'none',
      then(pick(' or ', 'bow'), ' on the last hit'),
    ],
    ['Stop', pick(' or ', 'dark'), '—', '—', pick(' or ', 'hit-blackout')],
  ];
  return `# ${brief.band}: cue sheet

Generated by \`npm run show:generate\` from the brief. Do not edit; edit the brief and re-run.

${g.entries.length} Scenes on ${layerNames.length + 1} Layers (Look, ${layerNames.join(', ')}) and ${sets.length} Colour Set${sets.length === 1 ? '' : 's'} on channel ${CH.colourSets}. C4 = note 60. Send MIDI Clock from the DAW for the Tempo.

## Rig

Built for ${rig}. Parts lit: ${present.join(', ') || 'none'}.
${left.length > 0 ? `\n${left.join('\n')}\n` : ''}
## Colour Sets

Rules take their colours from the held set by slot. Looks put Primary on the back, Secondary on the floor and Accent on the beams, and the front takes slot colours like any part. The first set holds when the Show opens. Names describe the colours (Primary / Secondary / Accent). Each song has three roles:

- Main: fire at bar 1. Held through verses and choruses.
- Break: fire on a bridge or breakdown, then Main again. Leads with a contrast hue.
- Swap: fire on the last chorus. The Main with Primary and Secondary exchanged.

| Note | # | Colour Set | Primary | Secondary | Accent | Fade |
|---|---|---|---|---|---|---|
${setRows.join('\n')}
${g.colourSets.notes.length > 0 ? `\n${g.colourSets.notes.map((n) => `- ${n}`).join('\n')}\n` : ''}
### Song sets

| Song | Main | Break | Swap |
|---|---|---|---|
${songRows.join('\n')}

## Tier guide

Names follow \`<Tier>: <Name>\`. Tiers sit on two octaves each: Chill C1 (24), Groove C3 (48), Drive C5 (72), Peak C7 (96), on every Layer that has tier Scenes. Utilities are on notes 12–23 of the Look channel, Hits on notes 12 and up of channel ${CH.hit}. Note 0 releases a Layer.

| Tier | Use | Dynamic Layers at once |
|---|---|---|
| Chill | Verses, intros and ballads. At most two parts lit, slow fades. | ${TIER_BANDS.chill.maxDynamic} |
| Groove | Mid-energy verses and pre-choruses. | ${TIER_BANDS.groove.maxDynamic} |
| Drive | Choruses. Beams come in. | ${TIER_BANDS.drive.maxDynamic} |
| Peak | The last chorus and the big moments. Everything lit, snapped. | ${TIER_BANDS.peak.maxDynamic} |

## How the Layers combine

- Look (channel ${CH.look}): colour and intensity. Each Layer holds one Scene at a time.
- Movement (channel ${CH.movement}), Pulse (channel ${CH.pulse}) and Colour FX (channel ${CH.colourfx}) add one kind of Effect each. They leave the front out. Colour FX use slot colours only. Each tier offers them on as many Layers as its stacking cap, so one of each at once stays inside it. A tier's Still Scene runs no Effect and does not count.
- Hit (channel ${CH.hit}): Flash only, held for 2 beats or less. A Hit may flash faster than the cap. Release restores what was under it.
- Every Look and Effect is built from slots, so a Colour Set change recolours it at once, with the Scenes still active.
- The front takes slot colours in Looks. Movement, Pulse and Colour FX leave it out for now. Fades are in beats.
- Scenes target Roles and Zones only, so the Show runs in any venue.
- Movement is stepped up in length so it stays under the Speed limit at ${bpm} BPM, the fastest song.

## Recommended combos

Fire one Scene per Layer. Keep to the cap for the tier: Chill 1 dynamic Layer, Groove 2, Drive 2, Peak 3.

| Section | Look | Movement | Pulse / Colour FX | Hits |
|---|---|---|---|---|
${combos.map((row) => `| ${row.join(' | ')} |`).join('\n')}

## Strobe

Strobe cap: ${show.strobeCap} Hz for every Scene fired by Go.
${goFlashing.length > 0 ? `\nScenes fired by Go that flash faster than the cap at ${bpm} BPM, the fastest song:\n\n${goFlashing.map((s) => `- ${s.name}`).join('\n')}\n` : `\nNo Scene fired by Go flashes faster than the cap at ${bpm} BPM, the fastest song.\n`}${hitFlashing.length > 0 ? `\nHits that flash faster than the cap. They are Flash only, so the cap does not apply. Hold for 2 beats or less:\n\n${hitFlashing.map((s) => `- ${s.name}`).join('\n')}\n` : ''}
## Note map

${noteMaps}
`;
}

/** The Show as saved by the app, indented so changes read well in a diff, and its Cue Sheet. */
export function generateFiles(
  brief: Brief,
  venue: VenueSummary,
): { show: string; cueSheet: string } {
  const g = generate(brief, venue);
  return {
    show: `${JSON.stringify(JSON.parse(saveShowFile(g.show)), null, 2)}\n`,
    cueSheet: cueSheet(brief, g),
  };
}

/** A name safe to use as a file name. */
export const fileName = (band: string): string =>
  band.replace(/[\\/:*?"<>|]/g, '').trim() || 'Show';

// ---------------------------------------------------------------- the command

/** Usage: `show:generate -- <brief.yaml> [--out <folder>] [--venue <file.lcvenue>]`. Returns the lines to print. */
export function run(argv: string[]): string[] {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { out: { type: 'string' }, venue: { type: 'string' } },
    strict: true,
    allowPositionals: true,
  });
  const [briefPath, ...extra] = positionals;
  if (briefPath === undefined || extra.length > 0) {
    throw new Error(
      'Usage: npm run show:generate -- <brief.yaml> [--out <folder>] [--venue <file.lcvenue>]',
    );
  }
  const loaded = loadBrief(briefPath);
  const files = generateFiles(loaded.brief, loaded.venue);
  const folder = values.out ? resolve(values.out) : dirname(resolve(briefPath));
  const lines = writeShowFiles(folder, fileName(loaded.brief.band), files).map((p) => `Wrote ${p}`);
  const venuePath =
    values.venue !== undefined
      ? resolve(values.venue)
      : loaded.brief.venue !== undefined
        ? resolve(loaded.dir, loaded.brief.venue)
        : undefined;
  if (venuePath !== undefined) {
    lines.push(venueCheckReport(files.show, readFileSync(venuePath, 'utf8'), venuePath));
  }
  return lines;
}
