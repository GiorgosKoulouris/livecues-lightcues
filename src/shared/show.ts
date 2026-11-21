// The Show model: the venue-independent part of a project. Shared because the
// engine runs it and the editor shows it.
//
// Scenes target Zones × Roles, never Fixtures, and hold no raw DMX values, so
// the same Show runs against any Venue Patch (ADR 0001).
import { colourProblems, inRange, type Colour } from './colour';
import { ROLES, type Role } from './fixture-profile';
import { findListedOn, listProblems, presetProblems } from './preset-list';
import {
  fixtureRole,
  fixtureZone,
  isZone,
  sameZone,
  type PatchedFixture,
  type VenuePatch,
  type Zone,
} from './venue-patch';

export { KELVIN_RANGE, SWATCHES, type Colour, type Swatch } from './colour';

// Named aims for moving Fixtures, computed per Fixture from its stage
// position and Mounting (ADR 0007).
export const DIRECTIONS = ['Down', 'Audience', 'Up', 'Cross', 'Centre', 'Out'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Where moving Fixtures aim when neither a Rule nor the Show sets a Direction.
export const DEFAULT_DIRECTION: Direction = 'Down';

// Movement Effects, run around a moving Fixture's base aim to the Tempo.
// Ballyhoo is a smooth random wander, the same each time for a Fixture. Fan
// opens the beams out from centre stage and closes them again; Figure-8 is one
// pan cycle and two tilt cycles.
export const EFFECT_SHAPES = [
  'Circle',
  'Pan sweep',
  'Tilt sweep',
  'Ballyhoo',
  'Fan',
  'Figure-8',
] as const;
export type EffectShape = (typeof EFFECT_SHAPES)[number];

// Beats per cycle, for every kind of Effect.
export const EFFECT_LENGTHS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
export type EffectLength = (typeof EFFECT_LENGTHS)[number];

// A number of beats as shown: 1/4, 1/2, 1, 2 and so on.
export function beatsLabel(beats: number): string {
  return beats < 1 ? `1/${1 / beats}` : String(beats);
}

// "1/2 beat", "1 beat", "2 beats".
export function beatsText(beats: number): string {
  return `${beatsLabel(beats)} beat${beats > 1 ? 's' : ''}`;
}

// The largest Effect size, in degrees.
export const MAX_EFFECT_SIZE = 180;

// The Speed limit: how fast a movement Effect may turn a moving Fixture, in
// degrees per second on pan and on tilt (ADR 0015).
export const SPEED_LIMIT = 300;

// Quick picks for an Effect's size, in degrees.
export const EFFECT_SIZES = { Small: 5, Medium: 12, Large: 25 } as const;

// How an Effect is offset across the Fixtures it targets, by stage position:
// Left→Right as the audience sees it, from Stage Right; Mirrored from centre
// out; Front→Back from the front of the stage; Alternate every other Fixture
// across; Random in a fixed order of each Fixture's own. Right→Left,
// Edges→Centre and Back→Front are the reverses.
export const SPREADS = [
  'In sync',
  'Left→Right',
  'Right→Left',
  'Mirrored',
  'Edges→Centre',
  'Front→Back',
  'Back→Front',
  'Alternate',
  'Random',
] as const;
export type Spread = (typeof SPREADS)[number];

// An Effect slot set to None stops the Effect of that kind from earlier Rules
// and lower Layers.
export const NO_EFFECT = 'None';
export type EffectSlot<E> = E | typeof NO_EFFECT;

export interface MovementEffect {
  shape: EffectShape;
  // Degrees from the base aim: over 0, at most `MAX_EFFECT_SIZE`.
  size: number;
  length: EffectLength;
  spread: Spread;
}

// Intensity Effects, which scale a Fixture's intensity to the Tempo. Pulse is
// a sine, full on the beat; Square is half on, half off; Chase lights a width
// of the Spread positions at a time; Random lights a random width's share of
// the Fixtures on each step.
export const INTENSITY_SHAPES = [
  'Pulse',
  'Ramp up',
  'Ramp down',
  'Square',
  'Chase',
  'Random',
] as const;
export type IntensityShape = (typeof INTENSITY_SHAPES)[number];

// The share a Chase or Random lights, besides the default of one (no width):
// of the Spread positions for a Chase, of the targeted Fixtures for a Random.
export const EFFECT_WIDTHS = [1 / 4, 1 / 3, 1 / 2] as const;
export type EffectWidth = (typeof EFFECT_WIDTHS)[number];

// The shapes that take a width.
export function takesWidth(shape: IntensityShape): boolean {
  return shape === 'Chase' || shape === 'Random';
}

export interface IntensityEffect {
  shape: IntensityShape;
  // How far it dips, 0–1: to 0 at 1, to half at 0.5.
  depth: number;
  length: EffectLength;
  spread: Spread;
  // Chase and Random only: absent is one position.
  width?: EffectWidth;
}

// The three colours a Colour Set holds, by slot.
export const SLOTS = ['Primary', 'Secondary', 'Accent'] as const;
export type Slot = (typeof SLOTS)[number];

// A slot reference: the held Colour Set's colour for that slot, in place of a
// Colour.
export interface SlotRef {
  slot: Slot;
}

// What a Rule, or a Step or Fade, sets as a colour: a Colour or a slot.
export type RuleColour = Colour | SlotRef;

export function isSlotRef(colour: RuleColour): colour is SlotRef {
  return 'slot' in colour;
}

// Colour Effects, which change a Fixture's colour to the Tempo. Step holds
// each colour in turn, Fade fades from each to the next, and Rainbow cycles
// the hue.
export const COLOUR_SHAPES = ['Step', 'Fade', 'Rainbow'] as const;
export type ColourShape = (typeof COLOUR_SHAPES)[number];

// How many colours a Step or Fade runs through.
export const MIN_EFFECT_COLOURS = 2;
export const MAX_EFFECT_COLOURS = 4;

// A Step or Fade runs through its colours over each cycle; a Rainbow takes
// none.
export type ColourEffect = { length: EffectLength; spread: Spread } & (
  { shape: 'Step' | 'Fade'; colours: RuleColour[] } | { shape: 'Rainbow' }
);

// How fast a Fixture strobes: Off, a named rate, or once per 1, 1/2 or 1/4
// beat of the Tempo. Off stops strobe from earlier Rules and lower Layers.
export const STROBE_RATES = ['Off', 'Slow', 'Medium', 'Fast', 1, 0.5, 0.25] as const;
export type StrobeRate = (typeof STROBE_RATES)[number];

// The named strobe rates, in Hz.
export const STROBE_HZ = { Slow: 2, Medium: 6, Fast: 12 } as const;

// What a Fixture's prism does: out of the beam, in it, or in and turning at a
// slow or fast rate. Off stops the prism from earlier Rules and lower Layers.
export const PRISM_SETTINGS = ['Off', 'On', 'Rotate slow', 'Rotate fast'] as const;
export type PrismSetting = (typeof PRISM_SETTINGS)[number];

// What each prism setting means, once for the engine, the preview and the
// protocol: the prism state it sends (in or out), how it looks in the preview
// (none when out), and the point of a rotation speed span it sends, 0 the
// slowest and 1 the fastest. Fixed, so a Show behaves the same on every
// Fixture (ADR 0020).
export const PRISM_BEHAVIOUR = {
  Off: { sends: 'out', preview: undefined, rotation: undefined },
  On: { sends: 'in', preview: 'on', rotation: undefined },
  'Rotate slow': { sends: 'in', preview: 'slow', rotation: 0.25 },
  'Rotate fast': { sends: 'in', preview: 'fast', rotation: 0.75 },
} as const satisfies Record<
  PrismSetting,
  { sends: 'in' | 'out'; preview: string | undefined; rotation: number | undefined }
>;

// Whether a Fixture's gobo wheel is on its open slot, or on a gobo. Open stops
// the gobo from earlier Rules and lower Layers.
export const GOBO_SETTINGS = ['Open', 'Gobo'] as const;
export type GoboSetting = (typeof GOBO_SETTINGS)[number];

// The Fixtures a Rule applies to: those in one of `zones` with one of
// `roles`. An absent list means every Zone or every Role.
export interface RuleTarget {
  zones?: Zone[];
  roles?: Role[];
}

// One part of a Scene. An absent setting leaves the attribute to earlier
// Rules and other Scenes. A Rule has an Effect slot per kind: movement,
// intensity and colour.
export interface Rule {
  target: RuleTarget;
  // 0–1.
  intensity?: number;
  colour?: RuleColour;
  // Aims the moving Fixtures targeted.
  direction?: Direction;
  // Moves the moving Fixtures targeted around their aim. None holds them
  // still.
  movementEffect?: EffectSlot<MovementEffect>;
  // Scales the targeted Fixtures' intensity. None holds it steady.
  intensityEffect?: EffectSlot<IntensityEffect>;
  // Changes the targeted Fixtures' colour, in place of `colour`: a Rule sets
  // one or the other. None stops the colour Effects below.
  colourEffect?: EffectSlot<ColourEffect>;
  // Strobes the Fixtures targeted that have a strobe channel.
  strobe?: StrobeRate;
  // Puts the prism in or out of the beam of the Fixtures targeted that have
  // one. Like strobe, a rate and not locked to the beat (ADR 0020).
  prism?: PrismSetting;
  // Puts the gobo wheel of the Fixtures targeted that have one on a gobo or
  // open.
  gobo?: GoboSetting;
}

// A slot that holds at most one active Scene.
export interface Layer {
  // Unique in the Show.
  id: string;
  name: string;
}

// What a Scene's fade-in is counted in. Seconds when a Scene has no unit.
export const FADE_UNITS = ['seconds', 'beats'] as const;
export type FadeUnit = (typeof FADE_UNITS)[number];

export interface Scene {
  // Unique in the Show.
  id: string;
  name: string;
  tags: string[];
  // A Layer id.
  layer: string;
  // In `fadeUnit`. A beat fade is resolved against the Tempo when the Scene
  // starts.
  fadeIn: number;
  fadeUnit?: FadeUnit;
  // How long the Scene takes to fade to what is under it when its Layer is
  // released or its Flash ends, in `fadeOutUnit`. Absent: it snaps.
  fadeOut?: number;
  fadeOutUnit?: FadeUnit;
  // Later Rules override earlier ones.
  rules: Rule[];
}

export const TRIGGER_MODES = ['go', 'flash', 'release'] as const;
export type TriggerMode = (typeof TRIGGER_MODES)[number];

// A note on a MIDI channel.
export interface MidiNote {
  // MIDI channel 1–16.
  channel: number;
  // MIDI note 0–127.
  note: number;
}

// A MIDI note mapped to a Scene action. Release clears the Scene's Layer.
export interface Trigger extends MidiNote {
  // A Scene id.
  scene: string;
  mode: TriggerMode;
}

// A named slot the House Lights go to, with the house look each Venue Patch
// gives it (ADR 0013). Its note only does Go.
export interface HousePreset {
  // Unique in the Show; Venue Patches key their house looks by it.
  id: string;
  name: string;
  // Seconds to crossfade from the current house state.
  fade: number;
  note?: MidiNote;
}

// A named slot every Hazer goes to (ADR 0018). Its note only does Go.
export interface HazePreset {
  // Unique in the Show.
  id: string;
  name: string;
  // 0–1, scaled by each Hazer's max output.
  level: number;
  // Seconds to crossfade from the current output.
  fade: number;
  note?: MidiNote;
}

// A named slot of three Colours the Show's Rules can name by slot. Its note
// only does Go, and one Colour Set holds at a time. When it changes, every slot
// colour crossfades to the new one over its fade. Not a palette: that is the
// Plan's per-tier Scene map.
export interface ColourSet {
  // Unique in the Show.
  id: string;
  name: string;
  colours: Record<Slot, Colour>;
  // Seconds to crossfade the slot colours from the held Colour Set.
  fade: number;
  note?: MidiNote;
}

export interface Show {
  // In display order.
  layers: Layer[];
  scenes: Scene[];
  triggers: Trigger[];
  // The Scene id of the Base Look.
  baseLook?: string;
  // The colour Fixtures show where no Rule sets one. White when absent.
  defaultColour?: Colour;
  // The Direction moving Fixtures aim at where no Rule sets one. Down when
  // absent.
  defaultDirection?: Direction;
  // In order, at most `MAX_HOUSE_PRESETS`. None when absent.
  housePresets?: HousePreset[];
  // In order, at most `MAX_HAZE_PRESETS`. None when absent. Haze Off is built
  // in and not listed.
  hazePresets?: HazePreset[];
  // In order, at most `MAX_COLOUR_SETS`. None when absent. The first holds at
  // launch and when the Show is opened.
  colourSets?: ColourSet[];
}

// The House Preset slots.
export const MAX_HOUSE_PRESETS = 8;

// The most Haze Presets: it limits the width of the button row in Perform. Haze
// has no keys.
export const MAX_HAZE_PRESETS = 8;

// The most Colour Sets: it limits the width of the button row in Perform.
export const MAX_COLOUR_SETS = 16;

export type ShowResult = { show: Show } | { errors: string[] };

// Whether a Rule applies to a patched Fixture: in one of its Zones and with
// one of its Roles, either absent meaning any.
export function ruleTargets(patch: VenuePatch, fixture: PatchedFixture, { target }: Rule): boolean {
  const zone = fixtureZone(patch, fixture);
  const role = fixtureRole(patch, fixture);
  const inZone = !target.zones || target.zones.some((z) => sameZone(z, zone));
  return inZone && (!target.roles || target.roles.includes(role));
}

// A new Show with one Layer.
export function emptyShow(): Show {
  return { layers: [{ id: 'layer-1', name: 'Layer 1' }], scenes: [], triggers: [] };
}

export function sameNote(a: MidiNote, b: MidiNote): boolean {
  return a.channel === b.channel && a.note === b.note;
}

// The Trigger mapped to a channel and note, if any.
export function findTrigger(show: Show, note: MidiNote): Trigger | undefined {
  return show.triggers.find((t) => sameNote(t, note));
}

// The two kinds of Preset list in a Show, by the Show's field. Their edits
// share one shape (preset-list.ts).
type PresetKey = 'housePresets' | 'hazePresets' | 'colourSets';
type PresetOf<K extends PresetKey> = NonNullable<Show[K]>[number];

function presetsOf<K extends PresetKey>(show: Show, key: K): PresetOf<K>[] {
  return (show[key] ?? []) as PresetOf<K>[];
}

export function showHousePresets(show: Show): HousePreset[] {
  return presetsOf(show, 'housePresets');
}

export function findHousePreset(show: Show, id: string): HousePreset | undefined {
  return showHousePresets(show).find((p) => p.id === id);
}

// The House Preset a channel and note fire, if any.
export function findHousePresetOn(show: Show, note: MidiNote): HousePreset | undefined {
  return findListedOn(showHousePresets(show), note);
}

export function showHazePresets(show: Show): HazePreset[] {
  return presetsOf(show, 'hazePresets');
}

export function findHazePreset(show: Show, id: string): HazePreset | undefined {
  return showHazePresets(show).find((p) => p.id === id);
}

// The Haze Preset a channel and note fire, if any.
export function findHazePresetOn(show: Show, note: MidiNote): HazePreset | undefined {
  return findListedOn(showHazePresets(show), note);
}

export function showColourSets(show: Show): ColourSet[] {
  return presetsOf(show, 'colourSets');
}

export function findColourSet(show: Show, id: string): ColourSet | undefined {
  return showColourSets(show).find((p) => p.id === id);
}

// The Colour Set a channel and note fire, if any.
export function findColourSetOn(show: Show, note: MidiNote): ColourSet | undefined {
  return findListedOn(showColourSets(show), note);
}

// Checks a whole Show. Returns readable errors; an empty list means it is
// valid.
export function validateShow(show: Show): string[] {
  const errors: string[] = [];
  for (const id of duplicates(show.layers.map((l) => l.id))) {
    errors.push(`Layer id "${id}" is used twice`);
  }
  for (const scene of show.scenes) {
    for (const problem of sceneProblems(show, scene)) {
      errors.push(`Scene "${scene.name}"${problem}`);
    }
  }
  for (const id of duplicates(show.scenes.map((s) => s.id))) {
    errors.push(`Scene id "${id}" is used twice`);
  }
  for (const trigger of show.triggers) {
    for (const problem of triggerProblems(show, trigger)) {
      errors.push(`Trigger ${trigger.channel}/${trigger.note}: ${problem}`);
    }
  }
  for (const key of duplicates(show.triggers.map((t) => `${t.channel}/${t.note}`))) {
    errors.push(`Trigger ${key} is mapped twice`);
  }
  if (show.baseLook !== undefined && !hasScene(show, show.baseLook)) {
    errors.push(`Base Look: Scene "${show.baseLook}" is not in the Show`);
  }
  if (show.defaultColour !== undefined) {
    for (const problem of colourProblems(show.defaultColour)) {
      errors.push(`Default colour: ${problem}`);
    }
  }
  if (show.defaultDirection !== undefined) {
    for (const problem of directionProblems(show.defaultDirection)) {
      errors.push(`Default Direction: ${problem}`);
    }
  }
  errors.push(...housePresetErrors(show));
  errors.push(...hazePresetErrors(show));
  errors.push(...colourSetErrors(show));
  return errors;
}

// Problems with a Scene, each starting with ': ' or ' Rule <n>: '.
function sceneProblems(
  show: Show,
  { layer, fadeIn, fadeUnit, fadeOut, fadeOutUnit, tags, rules }: Scene,
): string[] {
  const problems: string[] = [];
  if (!show.layers.some((l) => l.id === layer)) {
    problems.push(`: Layer "${layer}" is not in the Show`);
  }
  if (fadeUnit !== undefined && !FADE_UNITS.includes(fadeUnit)) {
    problems.push(`: fade unit "${fadeUnit}" is not seconds or beats`);
  }
  if (!Number.isFinite(fadeIn) || fadeIn < 0) {
    problems.push(`: fade-in must be 0 ${fadeUnit === 'beats' ? 'beats' : 'seconds'} or more`);
  }
  if (fadeOutUnit !== undefined && !FADE_UNITS.includes(fadeOutUnit)) {
    problems.push(`: fade-out unit "${fadeOutUnit}" is not seconds or beats`);
  }
  if (fadeOut !== undefined && (!Number.isFinite(fadeOut) || fadeOut < 0)) {
    problems.push(`: fade-out must be 0 ${fadeOutUnit === 'beats' ? 'beats' : 'seconds'} or more`);
  }
  for (const tag of tags) {
    if (tag === '') problems.push(': tag "" is empty');
    else if (tag.trim() !== tag) problems.push(`: tag "${tag}" has surrounding spaces`);
  }
  for (const tag of duplicates(tags)) problems.push(`: tag "${tag}" is listed twice`);
  rules.forEach((rule, i) => {
    for (const problem of ruleProblems(rule)) problems.push(` Rule ${i + 1}: ${problem}`);
  });
  return problems;
}

function triggerProblems(show: Show, { channel, note, scene, mode }: Trigger): string[] {
  const problems = noteProblems({ channel, note });
  if (!hasScene(show, scene)) problems.push(`Scene "${scene}" is not in the Show`);
  if (!TRIGGER_MODES.includes(mode)) problems.push(`mode "${mode}" is not go, flash or release`);
  return problems;
}

function noteProblems({ channel, note }: MidiNote): string[] {
  const problems: string[] = [];
  if (!isWhole(channel, 1, 16)) problems.push('channel must be a whole number from 1 to 16');
  if (!isWhole(note, 0, 127)) problems.push('note must be a whole number from 0 to 127');
  return problems;
}

// A House Preset note may not also be a Trigger's, so a note does one thing.
function housePresetErrors(show: Show): string[] {
  const presets = showHousePresets(show);
  const errors: string[] = [];
  for (const { id, name, fade, note } of presets) {
    const at = `House Preset "${name}": `;
    // Venue Patches key their house looks by the id.
    errors.push(...presetProblems({ id, name }, at));
    if (!Number.isFinite(fade) || fade < 0) errors.push(`${at}fade must be 0 seconds or more`);
    if (note === undefined) continue;
    errors.push(...noteProblems(note).map((problem) => at + problem));
    if (findTrigger(show, note)) {
      errors.push(`${at}note ${note.channel}/${note.note} is also a Trigger`);
    }
  }
  errors.push(...listProblems('House Preset', presets, MAX_HOUSE_PRESETS));
  return errors;
}

// A Haze Preset note may not also be a Trigger's or a House Preset's, so a
// note does one thing.
function hazePresetErrors(show: Show): string[] {
  const presets = showHazePresets(show);
  const errors: string[] = [];
  for (const { id, name, level, fade, note } of presets) {
    const at = `Haze Preset "${name}": `;
    errors.push(...presetProblems({ id, name }, at));
    if (!Number.isFinite(level) || level < 0 || level > 1) {
      errors.push(`${at}level must be within 0–1`);
    }
    if (!Number.isFinite(fade) || fade < 0) errors.push(`${at}fade must be 0 seconds or more`);
    if (note === undefined) continue;
    errors.push(...noteProblems(note).map((problem) => at + problem));
    if (findTrigger(show, note)) {
      errors.push(`${at}note ${note.channel}/${note.note} is also a Trigger`);
    }
    if (findHousePresetOn(show, note)) {
      errors.push(`${at}note ${note.channel}/${note.note} is also a House Preset`);
    }
  }
  errors.push(...listProblems('Haze Preset', presets, MAX_HAZE_PRESETS));
  return errors;
}

// A Colour Set note may not also be a Trigger's, a House Preset's or a Haze
// Preset's, so a note does one thing.
function colourSetErrors(show: Show): string[] {
  const sets = showColourSets(show);
  const errors: string[] = [];
  for (const { id, name, colours, fade, note } of sets) {
    const at = `Colour Set "${name}": `;
    errors.push(...presetProblems({ id, name }, at));
    for (const slot of SLOTS) {
      const colour = colours?.[slot] as Colour | undefined;
      if (typeof colour !== 'object' || colour === null) {
        errors.push(`${at}${slot} colour is missing`);
      } else if ('slot' in colour) {
        errors.push(`${at}${slot} colour must be a Colour, not a slot`);
      } else {
        for (const problem of colourProblems(colour)) errors.push(`${at}${slot}: ${problem}`);
      }
    }
    if (!Number.isFinite(fade) || fade < 0) errors.push(`${at}fade must be 0 seconds or more`);
    if (note === undefined) continue;
    errors.push(...noteProblems(note).map((problem) => at + problem));
    const taken = findTrigger(show, note)
      ? 'a Trigger'
      : findHousePresetOn(show, note)
        ? 'a House Preset'
        : findHazePresetOn(show, note)
          ? 'a Haze Preset'
          : undefined;
    if (taken) errors.push(`${at}note ${note.channel}/${note.note} is also ${taken}`);
  }
  errors.push(...listProblems('Colour Set', sets, MAX_COLOUR_SETS));
  return errors;
}

// The problems with a Rule's colour: a Colour, or a slot that exists.
function ruleColourProblems(colour: RuleColour): string[] {
  if (typeof colour !== 'object' || colour === null) return ['colour must be a Colour or a slot'];
  if (!isSlotRef(colour)) return colourProblems(colour);
  return SLOTS.includes(colour.slot) ? [] : [`"${colour.slot}" is not a slot`];
}

function hasScene(show: Show, id: string): boolean {
  return show.scenes.some((s) => s.id === id);
}

function ruleProblems(rule: Rule): string[] {
  const { target, intensity, colour, direction, strobe, prism, gobo } = rule;
  const { movementEffect, intensityEffect, colourEffect } = rule;
  const problems: string[] = [];
  const { zones, roles } = target;
  if (zones?.length === 0) problems.push('Zone list is empty');
  for (const zone of zones ?? []) {
    if (!isZone(zone)) {
      problems.push(`Zone ${zone.row}/${zone.column}/${zone.level} is not on the stage grid`);
    }
  }
  if (roles?.length === 0) problems.push('Role list is empty');
  for (const role of roles ?? []) {
    if (!ROLES.includes(role)) problems.push(`Role "${role}" is not a Role`);
  }
  if (intensity !== undefined && !inRange(intensity, 0, 1)) {
    problems.push('intensity must be from 0 to 1');
  }
  if (colour !== undefined) problems.push(...ruleColourProblems(colour));
  if (direction !== undefined) problems.push(...directionProblems(direction));
  if (strobe !== undefined && !STROBE_RATES.includes(strobe)) {
    problems.push('strobe must be Off, Slow, Medium, Fast, or 1, 1/2 or 1/4 beat');
  }
  if (prism !== undefined && !PRISM_SETTINGS.includes(prism)) {
    problems.push('prism must be Off, On, Rotate slow or Rotate fast');
  }
  if (gobo !== undefined && !GOBO_SETTINGS.includes(gobo)) {
    problems.push('gobo must be Open or Gobo');
  }
  problems.push(...slotProblems('movement', movementEffect, effectProblems));
  problems.push(...slotProblems('intensity', intensityEffect, intensityEffectProblems));
  problems.push(...slotProblems('colour', colourEffect, colourEffectProblems));
  if (colour !== undefined && colourEffect !== undefined) {
    problems.push('a Rule sets a colour or a colour Effect, not both');
  }
  return problems;
}

// Whether `size` is a movement Effect size: over 0, at most
// `MAX_EFFECT_SIZE`.
export function isEffectSize(size: number): boolean {
  return inRange(size, 0, MAX_EFFECT_SIZE) && size > 0;
}

// The problems with an Effect slot of `kind`: unset, None, or an Effect.
function slotProblems<E extends object>(
  kind: string,
  slot: EffectSlot<E> | undefined,
  problems: (effect: E) => string[],
): string[] {
  if (slot === undefined || slot === NO_EFFECT) return [];
  if (typeof slot === 'object' && slot !== null) return problems(slot);
  return [`${kind} Effect must be None or an Effect`];
}

function effectProblems({ shape, size, length, spread }: MovementEffect): string[] {
  const problems: string[] = [];
  if (!EFFECT_SHAPES.includes(shape)) problems.push(`"${shape}" is not a movement Effect shape`);
  if (!isEffectSize(size)) {
    problems.push(`Effect size must be over 0 and at most ${MAX_EFFECT_SIZE} degrees`);
  }
  return [...problems, ...timingProblems(length, spread)];
}

function intensityEffectProblems({
  shape,
  depth,
  length,
  spread,
  width,
}: IntensityEffect): string[] {
  const problems: string[] = [];
  if (!INTENSITY_SHAPES.includes(shape)) {
    problems.push(`"${shape}" is not an intensity Effect shape`);
  }
  if (!inRange(depth, 0, 1)) problems.push('Effect depth must be from 0 to 1');
  if (width !== undefined) {
    if (!takesWidth(shape)) {
      problems.push('only a Chase or Random takes a width');
    } else if (!EFFECT_WIDTHS.includes(width)) {
      problems.push('Effect width must be 1/4, 1/3 or 1/2');
    }
  }
  return [...problems, ...timingProblems(length, spread)];
}

function colourEffectProblems(effect: ColourEffect): string[] {
  const { shape, length, spread } = effect;
  const problems: string[] = [];
  if (!COLOUR_SHAPES.includes(shape)) {
    problems.push(`"${shape}" is not a colour Effect shape`);
  } else if (shape === 'Rainbow') {
    if ('colours' in effect) problems.push('Rainbow takes no colours');
  } else {
    // Not a list counts as no colours.
    const colours = Array.isArray(effect.colours) ? effect.colours : [];
    if (colours.length < MIN_EFFECT_COLOURS || colours.length > MAX_EFFECT_COLOURS) {
      problems.push(
        `a colour Effect must have ${MIN_EFFECT_COLOURS} to ${MAX_EFFECT_COLOURS} colours`,
      );
    }
    colours.forEach((colour, i) => {
      for (const problem of ruleColourProblems(colour))
        problems.push(`colour ${i + 1}: ${problem}`);
    });
  }
  return [...problems, ...timingProblems(length, spread)];
}

// The problems with an Effect's length and Spread, for every kind.
function timingProblems(length: EffectLength, spread: Spread): string[] {
  const problems: string[] = [];
  if (!EFFECT_LENGTHS.includes(length)) {
    const lengths = EFFECT_LENGTHS.map(beatsLabel)
      .join(', ')
      .replace(/, (\d+)$/, ' or $1');
    problems.push(`Effect length must be ${lengths} beats`);
  }
  if (!SPREADS.includes(spread)) problems.push(`"${spread}" is not a Spread`);
  return problems;
}

function directionProblems(direction: Direction): string[] {
  return DIRECTIONS.includes(direction) ? [] : [`"${direction}" is not a Direction`];
}

function isWhole(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
}
