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
// Dynamics (Movement, Pulse, Colour FX, Hits) come later: `dynamicEntries`
// is the seam, and `DYNAMIC_LAYERS` the Layers they add.
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { saveShowFile } from '../../src/engine/show-file';
import {
  type Colour,
  type ColourSet,
  type Layer,
  type Rule,
  type RuleColour,
  type Scene,
  type Show,
  type Slot,
  type Swatch,
  type Trigger,
} from '../../src/shared/show';
import { loadBrief, type Brief, type VenueSummary } from './brief';
import {
  ANALOGOUS_MAX_DEG,
  ANALOGOUS_MOODS,
  BASE_KELVIN,
  BASE_LEVELS,
  COLOUR_SET_FADE_S,
  COMPLEMENTARY_MIN_DEG,
  DEFAULT_MOOD,
  flashHz,
  hueGap,
  inPart,
  MAX_SONGS_PER_COLOUR_SET,
  MOOD_PRIMARIES,
  partTarget,
  PARTS,
  REFERENCE_BPM,
  SWATCH_HUE,
  TIER_FADE_OUT_BEATS,
  TIER_FRONT_KELVIN,
  TIER_LEVELS,
  TIERS,
  tierFadeIn,
  type Part,
  type Tier,
} from './rules';
import { venueCheckReport, writeShowFiles } from './write';

// ---------------------------------------------------------------- colour

export interface SongColours {
  song: string;
  primary: Swatch;
  secondary: Swatch;
  accent: Swatch;
}

export interface ColourSetPlan {
  sets: ColourSet[];
  /** Per Colour Set id, the songs that use it. */
  songs: Record<string, string[]>;
  /** Things the Cue Sheet says: a repeated primary, for one. */
  notes: string[];
}

const hueOf = (swatch: Swatch): number | undefined => SWATCH_HUE[swatch];
const HUE_SWATCHES = (Object.keys(SWATCH_HUE) as Swatch[]).filter((s) => s !== 'UV');

/** The swatch whose hue gap from `primary` is nearest `target`, among those the `ok` test allows. */
function nearestGap(
  primary: Swatch,
  target: number,
  ok: (gap: number) => boolean,
): Swatch | undefined {
  const from = hueOf(primary);
  if (from === undefined) return undefined;
  const options = HUE_SWATCHES.filter((s) => s !== primary && ok(hueGap(from, hueOf(s)!)));
  options.sort(
    (a, b) =>
      Math.abs(hueGap(from, hueOf(a)!) - target) - Math.abs(hueGap(from, hueOf(b)!) - target),
  );
  return options[0];
}

/**
 * P2: a Secondary across the colour wheel (150 degrees or more) or next to the
 * primary. A primary with no neighbour inside 45 degrees (Green, Cyan) takes a
 * complementary one; a white primary takes Blue.
 */
export function secondaryFor(primary: Swatch, kind: 'complementary' | 'analogous'): Swatch {
  const across = () => nearestGap(primary, 180, (g) => g >= COMPLEMENTARY_MIN_DEG);
  const next = () => nearestGap(primary, 30, (g) => g > 0 && g <= ANALOGOUS_MAX_DEG);
  return (kind === 'analogous' ? (next() ?? across()) : across()) ?? 'Blue';
}

/** Whether two swatches make a P2 pair: complementary or analogous, not a near miss. */
function goodPair(a: Swatch, b: Swatch): boolean {
  const [ha, hb] = [hueOf(a), hueOf(b)];
  if (ha === undefined || hb === undefined) return false;
  const gap = hueGap(ha, hb);
  return gap >= COMPLEMENTARY_MIN_DEG || (gap > 0 && gap <= ANALOGOUS_MAX_DEG);
}

/** P6: the primaries songs draw on: the band colours, else the mood's. One alone gains its complement. */
export function primaryPool(brief: Brief): Swatch[] {
  const own = brief.colours.filter((c) => hueOf(c) !== undefined);
  const pool = own.length > 0 ? own : [...MOOD_PRIMARIES[brief.mood ?? DEFAULT_MOOD]];
  return pool.length === 1 ? [...pool, secondaryFor(pool[0]!, 'complementary')] : pool;
}

/** The colours of each song: P1 (one primary, one secondary, white), P2, P5, P6. */
export function songColours(brief: Brief): { songs: SongColours[]; notes: string[] } {
  const pool = primaryPool(brief);
  const kind = ANALOGOUS_MOODS.includes(brief.mood ?? DEFAULT_MOOD) ? 'analogous' : 'complementary';
  const notes: string[] = [];
  const songs: SongColours[] = [];
  brief.songs.forEach((song, i) => {
    const previous = songs[i - 1]?.primary;
    const [given, givenSecondary, givenAccent] = song.colours ?? [];
    let primary = given;
    if (primary === undefined) {
      primary = pool[i % pool.length]!;
      if (primary === previous) primary = pool[(i + 1) % pool.length]!;
    } else if (primary === previous) {
      notes.push(`${song.name} repeats the primary of ${songs[i - 1]!.song} (its brief colours)`);
    }
    const secondary =
      givenSecondary ??
      brief.colours.find((c) => c !== primary && goodPair(primary, c)) ??
      secondaryFor(primary, kind);
    songs.push({ song: song.name, primary, secondary, accent: givenAccent ?? 'White' });
  });
  return { songs, notes };
}

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** One Colour Set per song; songs with the same colours share one, three at most. */
export function colourSets(brief: Brief): ColourSetPlan {
  const { songs, notes } = songColours(brief);
  const sets: ColourSet[] = [];
  const users: Record<string, string[]> = {};
  const keyOf = (s: SongColours) => `${s.primary}|${s.secondary}|${s.accent}`;
  const byKey = new Map<string, ColourSet[]>();
  for (const song of songs) {
    const open = (byKey.get(keyOf(song)) ?? []).find(
      (set) => users[set.id]!.length < MAX_SONGS_PER_COLOUR_SET,
    );
    if (open) {
      users[open.id]!.push(song.song);
      continue;
    }
    const set: ColourSet = {
      id: `set-${sets.length + 1}-${slugOf(song.song)}`,
      name: song.song,
      colours: {
        Primary: { swatch: song.primary },
        Secondary: { swatch: song.secondary },
        Accent: { swatch: song.accent },
      },
      fade: COLOUR_SET_FADE_S,
    };
    sets.push(set);
    users[set.id] = [song.song];
    byKey.set(keyOf(song), [...(byKey.get(keyOf(song)) ?? []), set]);
  }
  // A shared Colour Set is named for all its songs.
  for (const set of sets) set.name = users[set.id]!.join(' + ');
  return { sets, songs: users, notes };
}

// ---------------------------------------------------------------- rig

/** The parts the venue has Fixtures for. */
export function presentParts(venue: VenueSummary): Part[] {
  return PARTS.filter((part) => venue.groups.some((g) => inPart(part, g.role, g.zone)));
}

// ---------------------------------------------------------------- intensity

/** I1, I2: the level a part is lit to in a tier's Looks. */
export const levelOf = (tier: Tier, part: Part): number => TIER_LEVELS[tier][part];

// ---------------------------------------------------------------- composition

export interface Recipe {
  name: string;
  parts: readonly Part[];
}

// I4, I5: what a tier lights. Chill lights the front and at most one more part;
// Groove up to four; Drive and Peak everything the rig has (Peak has the one
// Look, since any other would leave a part dark, I5). The front is in
// every sung Look (I2), the back carries the Primary and the floor the
// Secondary (R2, R3), and white beams come in at Drive and Peak (P4).
export const RECIPES: Record<Tier, Recipe[]> = {
  chill: [
    { name: 'Glow', parts: ['front', 'back'] },
    { name: 'Floor Glow', parts: ['front', 'floor'] },
    { name: 'Haze Beams', parts: ['front', 'beams'] },
  ],
  groove: [
    { name: 'Steady', parts: ['front', 'back'] },
    { name: 'Colour', parts: ['front', 'back', 'floor'] },
    { name: 'Beams', parts: ['front', 'back', 'beams'] },
    { name: 'Full', parts: ['front', 'back', 'floor', 'beams'] },
  ],
  drive: [
    { name: 'Wide', parts: ['front', 'back', 'floor'] },
    { name: 'Beams', parts: ['front', 'back', 'beams'] },
    { name: 'Chorus', parts: ['front', 'back', 'floor', 'beams'] },
  ],
  peak: [{ name: 'Everything', parts: ['front', 'back', 'floor', 'beams', 'fx'] }],
};

const kelvin = (k: number): Colour => ({ kelvin: k });
const slot = (s: Slot): RuleColour => ({ slot: s });

/** P3, R1-R3: a part's colour. Front is pale kelvin and steady unless the brief lets it take colour. */
export function colourOf(part: Part, tier: Tier, front: Brief['front']): RuleColour {
  switch (part) {
    case 'front':
      return front === 'colour' ? slot('Primary') : kelvin(TIER_FRONT_KELVIN[tier]);
    case 'back':
      return slot('Primary');
    case 'floor':
      return slot('Secondary');
    default:
      return slot('Accent');
  }
}

/** The Rules of a Look: each lit part at its tier level, in its colour. */
export function composeLook(tier: Tier, parts: readonly Part[], front: Brief['front']): Rule[] {
  return parts.map((part) => ({
    target: partTarget(part),
    intensity: levelOf(tier, part),
    colour: colourOf(part, tier, front),
  }));
}

/** A tier's Looks for a rig: the recipes cut to the parts present, empty and repeated ones dropped. */
export function tierRecipes(tier: Tier, present: readonly Part[]): Recipe[] {
  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const recipe of RECIPES[tier]) {
    const parts = recipe.parts.filter((p) => present.includes(p));
    const key = parts.join();
    if (parts.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: recipe.name, parts });
  }
  return out;
}

// ---------------------------------------------------------------- Scenes and notes

// One MIDI channel per Layer. Colour Sets are on channel 6, where House and
// Haze Presets sit in Energy. Dynamic Layers keep channels 2-5 for later.
export const CH = { look: 1, movement: 2, pulse: 3, colourfx: 4, hit: 5, colourSets: 6 } as const;
export const LOOK_LAYER: Layer = { id: 'look', name: 'Look' };
/** The Layers the dynamics add. */
export const DYNAMIC_LAYERS: Layer[] = [];

const TIER_BASE: Record<Tier, number> = { chill: 24, groove: 48, drive: 72, peak: 96 };
const UTILITY_BASE = 12;
const COLOUR_SET_BASE = 12;

export interface Entry {
  scene: Scene;
  channel: number;
  note: number;
  mode: Trigger['mode'];
  about: string;
}

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

function lookScene(tier: Tier, recipe: Recipe, front: Brief['front']): Scene {
  return {
    id: `${tier}-${slugOf(recipe.name)}`,
    name: `${titleCase(tier)}: ${recipe.name}`,
    tags: ['look', `tier:${tier}`, ...recipe.parts.map((p) => `part:${p}`)],
    layer: LOOK_LAYER.id,
    fadeIn: tierFadeIn(tier),
    fadeUnit: 'beats',
    fadeOut: TIER_FADE_OUT_BEATS[tier],
    fadeOutUnit: 'beats',
    rules: composeLook(tier, recipe.parts, front),
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
function lookEntries(brief: Brief, present: Part[]): { entries: Entry[]; skipped: string[] } {
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
    tierRecipes(tier, present).forEach((recipe, i) => {
      entries.push({
        scene: lookScene(tier, recipe, brief.front),
        channel: CH.look,
        note: TIER_BASE[tier] + i,
        mode: 'go',
        about: `${recipe.parts.join(', ')}`,
      });
    });
  }
  return { entries, skipped };
}

/**
 * The seam for dynamics: Movement, Pulse, Colour FX and Hit Scenes, each on its
 * Layer's channel, tagged `dynamic` where they run an Effect. None yet.
 * It will take the brief and the parts present, as `lookEntries` does.
 */
export function dynamicEntries(): Entry[] {
  return [];
}

// ---------------------------------------------------------------- the Show

export function generate(brief: Brief, venue: VenueSummary): Generated {
  const present = presentParts(venue);
  const omitted = PARTS.filter((p) => !present.includes(p));
  const plan = colourSets(brief);
  const { entries: looks, skipped } = lookEntries(brief, present);
  const entries = [...looks, ...dynamicEntries()];
  const triggers: Trigger[] = [
    ...entries.map((e) => ({ channel: e.channel, note: e.note, scene: e.scene.id, mode: e.mode })),
    { channel: CH.look, note: 0, scene: 'base', mode: 'release' as const },
  ].sort((a, b) => a.channel - b.channel || a.note - b.note);
  const base = entries.some((e) => e.scene.id === 'base');
  const show: Show = {
    layers: [LOOK_LAYER, ...DYNAMIC_LAYERS],
    scenes: entries.map((e) => e.scene),
    triggers: base ? triggers : triggers.filter((t) => t.mode !== 'release'),
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
    return `| ${noteName(n)} | ${n} | ${set.name} | ${colourText(c.Primary)} | ${colourText(c.Secondary)} | ${colourText(c.Accent)} | ${g.colourSets.songs[set.id]!.join(', ')} | ${set.fade}s |`;
  });
  const sceneRows = [...g.entries]
    .sort((a, b) => a.channel - b.channel || a.note - b.note)
    .map((e) => {
      const s = e.scene;
      const mode = { go: 'Go', flash: 'Flash', release: 'Release' }[e.mode];
      return `| ${noteName(e.note)} | ${e.note} | ${s.name} | ${mode} | ${beatsOrSeconds(s.fadeIn, s.fadeUnit)} | ${s.fadeOut === undefined ? 'snap' : beatsOrSeconds(s.fadeOut, s.fadeOutUnit)} | ${e.about} | ${s.tags.join(' ')} |`;
    });
  const present = presentParts(g.venue);
  const rig =
    g.venue.source === 'venue'
      ? `the venue's ${g.venue.fixtures} Fixtures`
      : 'the default rig (front and back washes, beams, floor)';
  // The fastest song sets the pace: beat rates are quickest there.
  const bpm = Math.max(...brief.songs.map((song) => song.bpm));
  const flashing = flashingScenes(show, bpm);
  const left = [
    ...g.omitted.map((p) => `- Part left out: ${p}. The rig has no Fixtures for it.`),
    ...g.skipped.map((s) => `- Scene left out: ${s}.`),
  ];
  return `# ${brief.band}: cue sheet

Generated by \`npm run show:generate\` from the brief. Do not edit; edit the brief and re-run.

${g.entries.length} Scenes on MIDI channel ${CH.look}, one Layer, and ${sets.length} Colour Set${sets.length === 1 ? '' : 's'} on channel ${CH.colourSets}. C4 = note 60. Send MIDI Clock from the DAW for the Tempo.

## Rig

Built for ${rig}. Parts lit: ${present.join(', ') || 'none'}.
${left.length > 0 ? `\n${left.join('\n')}\n` : ''}
## Colour Sets

Fire one at bar 1 of each song. Rules take their colours from the held set by slot: Primary on the back, Secondary on the floor, Accent (white) on the beams. The first holds when the Show opens. The front is ${brief.front === 'pale' ? 'pale kelvin white and steady' : 'the Primary colour (the brief lets the front take colour)'}.

| Note | # | Colour Set | Primary | Secondary | Accent | Songs | Fade |
|---|---|---|---|---|---|---|---|
${setRows.join('\n')}
${g.colourSets.notes.length > 0 ? `\n${g.colourSets.notes.map((n) => `- ${n}`).join('\n')}\n` : ''}
## Tier guide

Names follow \`<Tier>: <Name>\`. Tiers sit on two octaves each: Chill C1 (24), Groove C3 (48), Drive C5 (72), Peak C7 (96). Utilities are on notes 12–23. Note 0 releases the Look Layer.

| Tier | Use |
|---|---|
| Chill | Verses, intros and ballads. At most two parts lit, slow fades. |
| Groove | Mid-energy verses and pre-choruses. |
| Drive | Choruses. Beams come in. |
| Peak | The last chorus and the big moments. Everything lit, snapped. |

## How the Layers combine

- One Layer, Look (channel ${CH.look}): colour and intensity. Each Look holds one Scene at a time. Movement, Pulse, Colour FX and Hits are not built yet.
- Every Look is built from slots, so a Colour Set change recolours it at once, with the Scenes still active.
- The front is steady and never moves or pulses. Fades are in beats.
- Scenes target Roles and Zones only, so the Show runs in any venue.

## Strobe

Strobe cap: ${show.strobeCap} Hz for every Scene fired by Go.
${flashing.length > 0 ? `\nScenes that flash faster than the cap at ${bpm} BPM, the fastest song:\n\n${flashing.map((s) => `- ${s.name}`).join('\n')}` : `\nNo Scene flashes faster than the cap at ${bpm} BPM, the fastest song.`}

## Note map

### Channel ${CH.look}: Look

| Note | # | Scene | Mode | Fade in | Fade out | What it does | Tags |
|---|---|---|---|---|---|---|---|
${show.triggers.some((t) => t.mode === 'release') ? `| ${noteName(0)} | 0 | — | Release | | | Release Look: back to the Base Look | |\n` : ''}${sceneRows.join('\n')}
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
