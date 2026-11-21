// Scene resolution: the active Scenes of a Show, resolved against a Venue
// Patch, as one DMX frame per Universe. Pure, so it is testable without
// hardware.
import { aimAt, aimDmx, turnAim, type AimAngles, type Turn } from '../shared/aim';
import { dmxByte, fixed, toDmx, type Point } from '../shared/dmx-point';
import { kelvinFraction, kelvinSupport } from '../shared/kelvin';
import {
  isHazeOrFan,
  type CapabilityRange,
  type Channel,
  type Emitter,
} from '../shared/fixture-profile';
import type { FixtureLight } from '../shared/protocol';
import {
  DEFAULT_DIRECTION,
  isSlotRef,
  NO_EFFECT,
  ruleTargets,
  type Colour,
  type Direction,
  type EffectLength,
  type Scene,
  type RuleColour,
  type Show,
  type Slot,
  type GoboSetting,
  KELVIN_RANGE,
  PRISM_BEHAVIOUR,
  type PrismSetting,
  type Swatch,
} from '../shared/show';
import {
  ASSUMED_STROBE_HZ,
  hzSpan,
  strobeDrives,
  strobeHz,
  type StrobeDrive,
} from '../shared/strobe';
import { mergeSnap, sceneSnap, type SnapSettings } from '../shared/snap-settings';
import { goboPrismDrive, hasPrism, rotationSpan, type GoboPrismDrive } from '../shared/gobo-prism';
import {
  colourEffectMix,
  effectTurn,
  fanPosition,
  intensityScale,
  spreadDelay,
  spreadPositions,
  type ColourMix,
} from './effects';
import { DEFAULT_BPM } from './tempo';
import {
  DMX_CHANNELS,
  fixtureMode,
  fixtureMounting,
  isMovingFixture,
  type PatchedFixture,
  type VenuePatch,
} from '../shared/venue-patch';

// The Scene a Layer shows, since `since` (seconds). Until the Scene's fade-in
// is over, the Layer crossfades from `from`, what it showed before; a Layer
// that was clear has no `from`. `shown` is what each moving Fixture showed at
// activation, by Fixture id: where a move starts, and which pan it stays near.
export interface ActiveScene {
  scene: string;
  since: number;
  // The fade-in in seconds, resolved against the Tempo at activation. Absent
  // for a restored Scene, whose fade is long over.
  fade?: number;
  from?: ActiveScene;
  shown?: Record<string, ShownAim>;
  // Set when the Layer was released with a fade-out: from `since` (seconds) the
  // Scene fades to what is under it over `fade` seconds. Its intensity and
  // colour fade; its Effects, strobe, prism and gobo stop at once. `to` is what
  // the Layer returns to, after a Flash.
  releasing?: { since: number; fade: number; to?: ActiveScene };
}

// A moving Fixture's aim at activation: its pan and tilt, the Direction they
// aim at, and whether it was dark then.
export interface ShownAim extends AimAngles {
  direction: Direction;
  dark: boolean;
}

// Keyed by Layer id. A Layer without an entry is clear.
export type ActiveScenes = Record<string, ActiveScene>;

// The length and size each movement Effect runs at under the Speed limit, by
// Scene id, then by the index of its Rule. An Effect not listed runs as
// programmed. Playback holds them (ADR 0015).
export type EffectRuns = Record<string, Record<number, { length: EffectLength; size: number }>>;

// Activates a Scene at `time`, replacing the active Scene in its Layer. It
// keeps what each moving Fixture in the Venue Patch shows then, under the
// Grand Master and at `beat` of the Tempo, its movement Effects at `runs`. A
// beat fade-in is resolved at `bpm` and keeps that length if the Tempo changes.
export function activate(
  active: ActiveScenes,
  show: Show,
  patch: VenuePatch,
  sceneId: string,
  time: number,
  grandMaster = 1,
  beat = 0,
  runs: EffectRuns = {},
  bpm = DEFAULT_BPM,
): ActiveScenes {
  const scene = findScene(show, sceneId);
  if (!scene) return active;
  const from = settle(active[scene.layer], time);
  const entry: ActiveScene = {
    scene: sceneId,
    since: time,
    fade: fadeSeconds(scene, bpm),
    shown: shownAims(show, patch, active, time, grandMaster, beat, runs),
  };
  // A finished fade no longer needs what it faded from.
  // A release still fading out is what the new Scene fades in from.
  if (from) {
    entry.from =
      from.releasing || fading(show, from, time) ? from : { scene: from.scene, since: from.since };
  }
  return { ...active, [scene.layer]: entry };
}

// What each moving Fixture shows at `time`, by Fixture id.
function shownAims(
  show: Show,
  patch: VenuePatch,
  active: ActiveScenes,
  time: number,
  grandMaster: number,
  beat: number,
  runs: EffectRuns,
): Record<string, ShownAim> {
  const shown: Record<string, ShownAim> = {};
  for (const fixture of patch.fixtures) {
    // Strobe does not change an aim, so any Tempo will do.
    const { output } = fixtureOutput(
      show,
      patch,
      active,
      fixture,
      time,
      grandMaster,
      beat,
      DEFAULT_BPM,
      runs,
      undefined,
    );
    const { aim, direction, intensity } = output;
    if (aim && direction) shown[fixture.id] = { ...aim, direction, dark: intensity === 0 };
  }
  return shown;
}

// Clears a Layer at once, without a fade.
export function clearLayer(active: ActiveScenes, layerId: string): ActiveScenes {
  return Object.fromEntries(Object.entries(active).filter(([id]) => id !== layerId));
}

// Releases a Layer at `time`. A Scene with a fade-out fades to what is under
// it over that time, at `bpm` for beats, to `to` (what a Flash covered) if
// given; one without snaps, as `clearLayer` does, and `to` is put back.
export function releaseLayer(
  active: ActiveScenes,
  show: Show,
  layerId: string,
  time: number,
  bpm = DEFAULT_BPM,
  to?: ActiveScene,
): ActiveScenes {
  const entry = settle(active[layerId], time);
  const fade = fadeOutSeconds(findScene(show, entry?.scene ?? ''), bpm);
  if (!entry || fade <= 0) {
    const cleared = clearLayer(active, layerId);
    return to ? { ...cleared, [layerId]: to } : cleared;
  }
  // A release already fading out runs on, to the new `to` if given.
  if (entry.releasing) {
    const kept = to ? { ...entry, releasing: { ...entry.releasing, to } } : entry;
    return { ...active, [layerId]: kept };
  }
  const releasing = { since: time, fade, ...(to ? { to } : {}) };
  return { ...active, [layerId]: { ...entry, releasing } };
}

// The Layers with each finished release replaced by what it returned to.
export function settleAll(active: ActiveScenes, time: number): ActiveScenes {
  const settled: ActiveScenes = {};
  for (const [id, entry] of Object.entries(active)) {
    const kept = settle(entry, time);
    if (kept) settled[id] = kept;
  }
  return settled;
}

// An entry as it is at `time`: what a finished release returned to, or nothing.
function settle(entry: ActiveScene | undefined, time: number): ActiveScene | undefined {
  const { releasing } = entry ?? {};
  if (!releasing || time < releasing.since + releasing.fade) return entry;
  return releasing.to;
}

// How far into its release a releasing entry is, 0-1.
function releaseProgress(
  { since, fade }: NonNullable<ActiveScene['releasing']>,
  time: number,
): number {
  return clamp((time - since) / fade);
}

// Whether a Layer is still crossfading at `time`.
function fading(show: Show, active: ActiveScene, time: number): boolean {
  return active.from !== undefined && progress(show, active, time) < 1;
}

// A Scene's fade-in in seconds, its beats taken at `bpm`.
function fadeSeconds(scene: Scene | undefined, bpm: number): number {
  if (!scene) return 0;
  return scene.fadeUnit === 'beats' ? (scene.fadeIn * 60) / bpm : scene.fadeIn;
}

// A Scene's fade-out in seconds, its beats taken at `bpm`; 0 when it has none.
function fadeOutSeconds(scene: Scene | undefined, bpm: number): number {
  if (!scene?.fadeOut) return 0;
  return scene.fadeOutUnit === 'beats' ? (scene.fadeOut * 60) / bpm : scene.fadeOut;
}

// How far into its fade-in an active Scene is, 0–1.
function progress(show: Show, active: ActiveScene, time: number): number {
  const fade = active.fade ?? fadeSeconds(findScene(show, active.scene), DEFAULT_BPM);
  return fade > 0 ? clamp((time - active.since) / fade) : 1;
}

function findScene(show: Show, id: string): Scene | undefined {
  return show.scenes.find((s) => s.id === id);
}

export function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

// One frame per Universe in the patch, channel 1 first, at `time` (seconds).
// The Grand Master (0–1) scales intensity after the Layers are combined.
// Movement Effects run at `beat`, the Tempo's beat count, and at `runs`; beat
// strobe rates at `bpm`, the Tempo.
export function resolveFrames(
  show: Show,
  patch: VenuePatch,
  active: ActiveScenes,
  time: number,
  grandMaster = 1,
  beat = 0,
  bpm = DEFAULT_BPM,
  runs: EffectRuns = {},
  slots?: SlotLevels,
): Map<number, Uint8Array> {
  const frames = new Map(patch.universes.map((u) => [u.number, new Uint8Array(DMX_CHANNELS)]));
  for (const fixture of patch.fixtures) {
    const resolved = fixtureOutput(
      show,
      patch,
      active,
      fixture,
      time,
      grandMaster,
      beat,
      bpm,
      runs,
      slots,
    );
    const { channels, output } = resolved;
    frames.get(fixture.universe)!.set(encodeChannels(channels, output), fixture.address - 1);
  }
  return frames;
}

// How each Fixture in the patch looks at `time`, by Fixture id, resolved like
// `resolveFrames`.
export function resolveLights(
  show: Show,
  patch: VenuePatch,
  active: ActiveScenes,
  time: number,
  grandMaster = 1,
  beat = 0,
  bpm = DEFAULT_BPM,
  runs: EffectRuns = {},
  slots?: SlotLevels,
): Record<string, FixtureLight> {
  return Object.fromEntries(
    patch.fixtures.map((fixture) => {
      const resolved = fixtureOutput(
        show,
        patch,
        active,
        fixture,
        time,
        grandMaster,
        beat,
        bpm,
        runs,
        slots,
      );
      const { channels, output } = resolved;
      return [fixture.id, fixtureLight(channels, output)];
    }),
  );
}

// How a Fixture set to `output` looks in the preview.
function fixtureLight(channels: Channel[], output: FixtureOutput): FixtureLight {
  const { red, green, blue } = shownColour(channels, output);
  return {
    intensity: output.intensity,
    red,
    green,
    blue,
    ...(output.aim && { aim: output.aim }),
    ...(output.strobe && { strobe: output.strobe.hz }),
    ...previewPrism(channels, output),
  };
}

// The prism a Fixture shows in the preview: only one that has a prism, with it
// set in or turning.
function previewPrism(channels: Channel[], output: FixtureOutput): Pick<FixtureLight, 'prism'> {
  const prism = output.goboPrism?.prism;
  const preview = prism && PRISM_BEHAVIOUR[prism].preview;
  return preview && hasPrism(channels) ? { prism: preview } : {};
}

// What a Fixture is set to once the Layers are combined, and the channels of
// its mode. A movement Effect turns a moving Fixture from its aim; an
// intensity Effect scales the intensity, before the Grand Master; a colour
// Effect's colour shows over the plain colour, until a None or a later plain
// colour. A lit Fixture with a strobe channel strobes at the rate last set, at
// `bpm` for a beat rate.
function fixtureOutput(
  show: Show,
  patch: VenuePatch,
  active: ActiveScenes,
  fixture: PatchedFixture,
  time: number,
  grandMaster: number,
  beat: number,
  bpm: number,
  runs: EffectRuns,
  held: SlotLevels | undefined,
): { channels: Channel[]; output: FixtureOutput } {
  const slots = held ?? defaultSlots(show);
  const entries = byChange(show, active, time);
  const items = entries.map((entry) => ({ entry, layer: layerIndex(show, entry) }));
  const state = stackLooks(show, patch, fixture, items, time, beat, runs, slots);
  const { intensity, colour, effectColour, direction, turn, scale, snap } = state;
  const shown =
    effectColour === undefined || effectColour === NO_EFFECT
      ? (colour ?? defaultColour(show))
      : effectColour;
  const { channels } = fixtureMode(patch, fixture);
  const output = levelOutput(channels, intensity * (scale ?? STEADY) * grandMaster, shown);
  const { strobe, prism, gobo } = snap;
  const hz = strobe === undefined ? 0 : strobeHz(strobe, bpm);
  if (hz > 0 && output.intensity > 0) {
    const drives = strobeDrives(channels);
    if (drives.size > 0) output.strobe = { hz, drives };
  }
  // Prism and gobo are set whether or not the Fixture is lit.
  if (prism !== undefined || gobo !== undefined) {
    output.goboPrism = { prism, gobo, slot: fixture.goboSlot };
  }
  if (isMovingFixture(patch, fixture)) {
    output.direction = direction ?? show.defaultDirection ?? DEFAULT_DIRECTION;
    output.aim = fixtureAim(show, patch, fixture, channels, output.direction, entries, time, turn);
  }
  return { channels, output };
}

// An active Scene and the index of its Layer, lowest first. `stopped` keeps
// only what a fading-out Layer keeps of its look.
interface Item {
  entry: ActiveScene;
  layer: number;
  stopped?: boolean;
}

function layerIndex(show: Show, entry: ActiveScene): number {
  const layer = findScene(show, entry.scene)?.layer;
  return show.layers.findIndex((l) => l.id === layer);
}

// The `items` combined in order, later ones over earlier. A Layer fading out
// fades from the Layers as they are now to what is under it by Layer order: the
// Layers below it, then what it returns to. Layers below it fired after it
// show in both, so its fade has no jump at release and ends on them.
function stackLooks(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
  items: Item[],
  time: number,
  beat: number,
  runs: EffectRuns,
  slots: SlotLevels,
): Combined {
  let state: Combined = { intensity: 0, snap: {} };
  const skipped = new Set<Item>();
  items.forEach((item, i) => {
    if (skipped.has(item)) return;
    const { entry } = item;
    const look = layerLook(show, patch, fixture, entry, time, beat, runs, slots);
    const { releasing } = entry;
    if (item.stopped) {
      state = combineLook(show, state, stoppedLook(look));
      return;
    }
    if (!releasing) {
      state = combineLook(show, state, look);
      return;
    }
    // Fading out: intensity and colour fade to what is under, Effects and
    // strobe stop at once.
    const earlier = items.slice(0, i);
    const below = items.slice(i + 1).filter((o) => o.layer < item.layer && !skipped.has(o));
    for (const o of below) skipped.add(o);
    const to =
      releasing.to && layerLook(show, patch, fixture, releasing.to, time, beat, runs, slots);
    const base = stackLooks(show, patch, fixture, [...earlier, ...below], time, beat, runs, slots);
    const under = to ? combineLook(show, base, to) : base;
    const over = stackLooks(
      show,
      patch,
      fixture,
      [...earlier, { ...item, stopped: true }, ...below],
      time,
      beat,
      runs,
      slots,
    );
    state = mixCombined(show, over, under, releaseProgress(releasing, time));
  });
  return state;
}

// What the Layers combined so far set on a Fixture.
interface Combined {
  intensity: number;
  colour?: ColourLevels;
  effectColour?: EffectColour;
  direction?: Direction;
  turn?: Turn;
  scale?: number;
  snap: SnapSettings;
}

// `state` with a Layer's `look` combined over it.
function combineLook(show: Show, state: Combined, look: Look): Combined {
  const next: Combined = {
    intensity: Math.max(state.intensity, look.intensity ?? 0),
    snap: look.snap ? mergeSnap(state.snap, look.snap) : state.snap,
  };
  const effectColour = combinedEffectColour(
    state.effectColour,
    look,
    state.colour ?? defaultColour(show),
  );
  if (effectColour !== undefined) next.effectColour = effectColour;
  const colour = look.colour ?? state.colour;
  if (colour) next.colour = colour;
  const direction = look.direction ?? state.direction;
  if (direction) next.direction = direction;
  const turn = combinedTurn(state.turn, look);
  if (turn) next.turn = turn;
  const scale = combinedScale(state.scale, look);
  if (scale !== undefined) next.scale = scale;
  return next;
}

// What a fading-out Layer keeps of its look: intensity, colour and Direction.
// Its Effects, strobe, prism and gobo have stopped.
function stoppedLook({ intensity, colour, direction }: Look): Look {
  return {
    ...(intensity !== undefined && { intensity }),
    ...(colour && { colour, effectColour: NO_EFFECT }),
    ...(direction && { direction }),
  };
}

// `over`, a fading-out Layer combined over the Layers below, `p` (0-1) of the
// way to `under`, what it returns to. Effects and the Direction are `under`'s.
function mixCombined(show: Show, over: Combined, under: Combined, p: number): Combined {
  const fallback = defaultColour(show);
  const shown = (c: Combined): ColourLevels => {
    const effect = c.effectColour;
    return effect && effect !== NO_EFFECT ? effect : (c.colour ?? fallback);
  };
  const mixed: Combined = {
    intensity: lerp(over.intensity, under.intensity, p),
    snap: under.snap,
  };
  // With no colour below, the colour is held as the intensity fades.
  const colour = over.colour && under.colour ? blend(over.colour, under.colour, p) : under.colour;
  if (colour ?? over.colour) mixed.colour = colour ?? over.colour;
  const effects = [over, under].some((c) => c.effectColour && c.effectColour !== NO_EFFECT);
  if (effects) mixed.effectColour = blend(shown(over), shown(under), p);
  else if (under.effectColour !== undefined) mixed.effectColour = under.effectColour;
  const direction = under.direction ?? over.direction;
  if (direction) mixed.direction = direction;
  if (over.turn || under.turn) {
    const [a, b] = [over.turn ?? STILL, under.turn ?? STILL];
    mixed.turn = { pan: lerp(a.pan, b.pan, p), tilt: lerp(a.tilt, b.tilt, p) };
  }
  if (under.scale !== undefined) mixed.scale = under.scale;
  return mixed;
}

// A Fixture set to `intensity` and `colour`, on the channels of its mode.
function levelOutput(channels: Channel[], intensity: number, colour: ColourLevels): FixtureOutput {
  const capabilities = channels.flatMap((channel) =>
    channel.kind === 'control' ? channel.ranges.map((r) => r.capability) : [],
  );
  const hasDimmer = capabilities.some((c) => c.type === 'intensity');
  const emitters = new Set(capabilities.flatMap((c) => (c.type === 'emitter' ? [c.emitter] : [])));
  const cct =
    colour.kelvin !== undefined &&
    kelvinSupport(channels) === 'cct' &&
    emitters.has('warmWhite') &&
    emitters.has('coldWhite');
  return {
    intensity,
    colour,
    emitters,
    mix: mixesColour(emitters)
      ? emitterMix(colour, emitters)
      : cct
        ? cctMix(colour.kelvin!)
        : fullMix(emitters),
    emitterScale: hasDimmer ? 1 : intensity,
  };
}

// The DMX values of a Fixture's channels set to `intensity` (0–1) and
// `colour`, with no Show: the other channels stay at their defaults. For
// House Lights, which Scenes never reach.
export function levelChannels(
  channels: Channel[],
  intensity: number,
  colour: ColourLevels,
): number[] {
  return encodeChannels(channels, levelOutput(channels, intensity, colour));
}

// The Focus Check over `frames`: every moving Fixture in the patch aimed at
// `direction`, open in white at `intensity` (0–1). Other Fixtures keep what
// `frames` has. Returns new frames; `frames` is not changed.
export function focusCheckFrames(
  patch: VenuePatch,
  frames: Map<number, Uint8Array>,
  direction: Direction,
  intensity: number,
): Map<number, Uint8Array> {
  const focused = new Map([...frames].map(([number, frame]) => [number, frame.slice()]));
  for (const fixture of patch.fixtures) {
    const focus = focusCheckOutput(patch, fixture, direction, intensity);
    if (!focus) continue;
    let frame = focused.get(fixture.universe);
    if (!frame) focused.set(fixture.universe, (frame = new Uint8Array(DMX_CHANNELS)));
    frame.set(encodeChannels(focus.channels, focus.output), fixture.address - 1);
  }
  return focused;
}

// The Focus Check over `lights`, as `focusCheckFrames` over frames.
export function focusCheckLights(
  patch: VenuePatch,
  lights: Record<string, FixtureLight>,
  direction: Direction,
  intensity: number,
): Record<string, FixtureLight> {
  const focused = { ...lights };
  for (const fixture of patch.fixtures) {
    const focus = focusCheckOutput(patch, fixture, direction, intensity);
    if (focus) focused[fixture.id] = fixtureLight(focus.channels, focus.output);
  }
  return focused;
}

// What the Focus Check sets a Fixture to; undefined unless it moves.
function focusCheckOutput(
  patch: VenuePatch,
  fixture: PatchedFixture,
  direction: Direction,
  intensity: number,
): { channels: Channel[]; output: FixtureOutput } | undefined {
  if (!isMovingFixture(patch, fixture)) return undefined;
  const { channels } = fixtureMode(patch, fixture);
  const output = levelOutput(channels, intensity, WHITE);
  const aim = aimAt({
    position: fixture,
    mounting: fixtureMounting(fixture),
    channels,
    stage: patch.stage,
    direction,
  });
  if (aim) output.aim = { pan: aim.pan, tilt: aim.tilt };
  return { channels, output };
}

// A moving Fixture's pan and tilt at `time`, aimed at `direction` and turned
// by `turn`. The activation that last changed its Direction times the move:
// the aim moves from the one shown then, over that Scene's fade-in, in
// degrees, to the pan nearest the one shown then. A Fixture dark then snaps.
// With no such activation, the pan is the one nearest the pan shown at the
// last activation, or the centre of its range.
function fixtureAim(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
  channels: Channel[],
  direction: Direction,
  entries: ActiveScene[],
  time: number,
  turn: Turn | undefined,
): AimAngles | undefined {
  const shownBy = (entry: ActiveScene) => entry.shown?.[fixture.id];
  const movedBy = entries.findLast((entry) => {
    const shown = shownBy(entry);
    return shown !== undefined && shown.direction !== direction;
  });
  const latest = movedBy ?? entries.at(-1);
  const shown = latest && shownBy(latest);
  const mounting = fixtureMounting(fixture);
  const aimed = aimAt({
    position: fixture,
    mounting,
    channels,
    stage: patch.stage,
    direction,
    ...(shown?.pan !== undefined ? { currentPan: shown.pan } : {}),
  });
  if (!aimed) return undefined;
  const aim = turnAim(channels, mounting, aimed, turn ?? STILL);
  if (!movedBy || !shown || shown.dark) return aim;
  const p = progress(show, movedBy, time);
  const move = (from?: number, to?: number) =>
    from === undefined || to === undefined ? to : lerp(from, to, p);
  return { pan: move(shown.pan, aim.pan), tilt: move(shown.tilt, aim.tilt) };
}

// The colour a Fixture shows at full: the colour-wheel slot picked, the
// colour mixed, or the colour of its fixed emitters. White when it has none of
// these.
function shownColour(channels: Channel[], { colour, emitters }: FixtureOutput): ColourLevels {
  const slots = channels.flatMap((channel) =>
    channel.kind === 'control'
      ? channel.ranges.filter((r) => r.capability.type === 'wheelSlot')
      : [],
  );
  if (slots.length > 0) return slotLevels(nearestSlot(slots, colour));
  if (mixesColour(emitters)) return colour;
  if (colour.kelvin !== undefined && kelvinSupport(channels) === 'cct') return colour;
  if (emitters.size === 0) return WHITE;
  const levels = [...emitters].map((e) => EMITTER_LEVELS[e]);
  const average = (pick: (l: ColourLevels) => number) =>
    levels.reduce((sum, l) => sum + pick(l), 0) / levels.length;
  return rgbLevels(
    average((l) => l.red),
    average((l) => l.green),
    average((l) => l.blue),
  );
}

// The active Scenes, the one changed least recently first, so later ones
// take precedence. Layers changed at the same time go in Layer order.
function byChange(show: Show, active: ActiveScenes, time: number): ActiveScene[] {
  return show.layers
    .flatMap((layer) => settle(active[layer.id], time) ?? [])
    .sort((a, b) => a.since - b.since);
}

// The colour Fixtures show where no Rule sets one.
function defaultColour(show: Show): ColourLevels {
  return show.defaultColour ? colourLevels(show.defaultColour) : WHITE;
}

// What one Scene sets on a Fixture. An absent attribute is left to other
// Scenes. `turn` is a moving Fixture's turn by a movement Effect, or still
// under None; `scale` is how much an intensity Effect scales the intensity, or
// steady under None; `effectColour` is a colour Effect's colour, or None,
// showing `colour`, the plain colour. While a Layer crossfades, `turnFade`,
// `scaleFade` and `effectColourFade` hold them instead.
interface Look {
  intensity?: number;
  colour?: ColourLevels;
  effectColour?: EffectColour;
  effectColourFade?: ColourFade;
  direction?: Direction;
  turn?: Turn;
  turnFade?: Fade<Turn>;
  scale?: number;
  scaleFade?: Fade<number>;
  snap?: SnapSettings;
}

// An Effect fading `p` (0–1) of the way between two looks' values. An absent
// one is the value the Layers below give.
interface Fade<T> {
  from?: T;
  to?: T;
  p: number;
}

const STILL: Turn = { pan: 0, tilt: 0 };

// The scale that leaves intensity as it is.
const STEADY = 1;

// A colour Effect's colour, or None: the plain colour shows.
type EffectColour = ColourLevels | typeof NO_EFFECT;

// A colour Effect's colour fading in. A fade cut off by the next keeps
// fading under it, so both resolve over the Layers below when combined.
// `plain` is the look's plain colour, which a None shows.
type ColourFade = Fade<EffectColour | ColourFade> & { plain?: ColourLevels };

// The turn once a look is combined over `below`, the turn the Layers below
// give.
function combinedTurn(below: Turn | undefined, { turn, turnFade }: Look): Turn | undefined {
  return combined(below, turn, turnFade, STILL, (from, to, p) => ({
    pan: lerp(from.pan, to.pan, p),
    tilt: lerp(from.tilt, to.tilt, p),
  }));
}

// The scale once a look is combined over `below`, the scale the Layers below
// give.
function combinedScale(below: number | undefined, { scale, scaleFade }: Look): number | undefined {
  return combined(below, scale, scaleFade, STEADY, lerp);
}

// The colour Effect's colour once a look is combined over `below`, the one
// the Layers below give. A fade from or to None is from or to the look's
// plain colour, or else `plain`, the one the Layers below give.
function combinedEffectColour(
  below: EffectColour | undefined,
  { effectColour, effectColourFade }: Look,
  plain: ColourLevels,
): EffectColour | undefined {
  if (!effectColourFade) return effectColour ?? below;
  return fadedColour(effectColourFade, below ?? NO_EFFECT, plain);
}

// Where a colour Effect's fade has got to over `below`. Either end may be a
// fade itself, or absent for `below`.
function fadedColour(fade: ColourFade, below: EffectColour, plain: ColourLevels): EffectColour {
  const { from, to, p } = fade;
  const end = (c: EffectColour | ColourFade | undefined): EffectColour =>
    c === undefined ? below : c === NO_EFFECT || !('p' in c) ? c : fadedColour(c, below, plain);
  const [a, b] = [end(from), end(to)];
  if (a === NO_EFFECT && b === NO_EFFECT) return NO_EFFECT;
  const levels = (c: EffectColour) => (c === NO_EFFECT ? (fade.plain ?? plain) : c);
  return blend(levels(a), levels(b), p);
}

// An Effect's value once a look's `value`, or its `fade`, is combined over
// `below`. With nothing below, a fade is from or to `rest`.
function combined<T>(
  below: T | undefined,
  value: T | undefined,
  fade: Fade<T> | undefined,
  rest: T,
  mix: (from: T, to: T, p: number) => T,
): T | undefined {
  if (!fade) return value ?? below;
  const { from = below ?? rest, to = below ?? rest, p } = fade;
  return mix(from, to, p);
}

// A fade `p` of the way from `from` to `to`; none when neither is set.
function fadeBetween<T>(from: T | undefined, to: T | undefined, p: number): Fade<T> | undefined {
  if (from === undefined && to === undefined) return undefined;
  return { p, ...(from !== undefined && { from }), ...(to !== undefined && { to }) };
}

// What a Layer sets on a Fixture at `time` and `beat`. While crossfading,
// intensity fades between the two looks, an absent one counting as 0; colour
// fades between them when both set it, or else holds the one that does. The
// Direction is the new look's at once; `fixtureAim` times the move. A
// movement Effect's turn, an intensity Effect's scale and a colour Effect's
// colour fade from the one before, or the one below, so the size, depth or
// colour fades in with the Scene. Both looks' Effects keep running to `beat`.
// Strobe, prism and gobo are the new look's at once, not crossfaded.
function layerLook(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
  active: ActiveScene,
  time: number,
  beat: number,
  runs: EffectRuns,
  slots: SlotLevels,
): Look {
  const { scene: id, since, from } = active;
  const scene = findScene(show, id);
  const target = scene ? sceneLook(patch, fixture, scene, beat, runs, slots) : {};
  const p = progress(show, active, time);
  if (p === 1) return target;
  const before = from ? fromLook(show, patch, fixture, from, since, beat, runs, slots) : {};
  const look: Look = {};
  if (before.intensity !== undefined || target.intensity !== undefined) {
    look.intensity = lerp(before.intensity ?? 0, target.intensity ?? 0, p);
  }
  const colour =
    before.colour && target.colour
      ? blend(before.colour, target.colour, p)
      : (target.colour ?? before.colour);
  if (colour) look.colour = colour;
  if (target.direction) look.direction = target.direction;
  if (target.snap) look.snap = target.snap;
  // A fade underway before is taken as over the Fixture held still and steady.
  // A colour Effect's fade keeps fading under this one.
  const beforeTurn = before.turnFade ? combinedTurn(STILL, before) : before.turn;
  const turnFade = fadeBetween(beforeTurn, target.turn, p);
  if (turnFade) look.turnFade = turnFade;
  const beforeScale = before.scaleFade ? combinedScale(STEADY, before) : before.scale;
  const scaleFade = fadeBetween(beforeScale, target.scale, p);
  if (scaleFade) look.scaleFade = scaleFade;
  const effectColourFade = fadeBetween<EffectColour | ColourFade>(
    before.effectColourFade ?? before.effectColour,
    target.effectColour,
    p,
  );
  if (effectColourFade) {
    look.effectColourFade = look.colour
      ? { ...effectColourFade, plain: look.colour }
      : effectColourFade;
  }
  return look;
}

// What the Layer showed at `time`, when a Scene took over: `from`, a release
// still fading out included, which fades to what it returns to, or to nothing.
function fromLook(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
  from: ActiveScene,
  time: number,
  beat: number,
  runs: EffectRuns,
  slots: SlotLevels,
): Look {
  const look = layerLook(show, patch, fixture, from, time, beat, runs, slots);
  const { releasing } = from;
  if (!releasing) return look;
  const p = releaseProgress(releasing, time);
  const to = releasing.to && layerLook(show, patch, fixture, releasing.to, time, beat, runs, slots);
  const out = stoppedLook(look);
  const colour =
    out.colour && to?.colour ? blend(out.colour, to.colour, p) : (to?.colour ?? out.colour);
  return {
    ...out,
    ...(out.intensity !== undefined || to?.intensity !== undefined
      ? { intensity: lerp(out.intensity ?? 0, to?.intensity ?? 0, p) }
      : {}),
    ...(colour && { colour }),
  };
}

// What a Scene sets on a Fixture, its Effects at `beat` and its movement
// Effects at `runs`. An intensity or colour Effect's Spread orders every
// Fixture the Rule targets. A plain colour stops the colour Effects before it,
// as a None does.
function sceneLook(
  patch: VenuePatch,
  fixture: PatchedFixture,
  scene: Scene,
  beat: number,
  runs: EffectRuns,
  slots: SlotLevels,
): Look {
  const look: Look = {};
  const snap = sceneSnap(patch, fixture, scene);
  if (Object.keys(snap).length > 0) look.snap = snap;
  const moving = isMovingFixture(patch, fixture);
  for (const [index, rule] of scene.rules.entries()) {
    if (!ruleTargets(patch, fixture, rule)) continue;
    if (rule.intensity !== undefined) look.intensity = rule.intensity;
    if (rule.colour !== undefined) {
      look.colour = ruleLevels(rule.colour, slots);
      look.effectColour = NO_EFFECT;
    }
    if (rule.direction !== undefined) look.direction = rule.direction;
    const effect = rule.movementEffect;
    if (effect === NO_EFFECT && moving) {
      look.turn = STILL;
    } else if (effect !== undefined && effect !== NO_EFFECT && moving) {
      const targeted = patch.fixtures.filter(
        (other) => isMovingFixture(patch, other) && ruleTargets(patch, other, rule),
      );
      const delay = spreadDelay(effect.spread, fixture, targeted);
      const run = runs[scene.id]?.[index];
      look.turn = effectTurn(
        run ? { ...effect, ...run } : effect,
        beat,
        delay,
        fixture.id,
        fanPosition(fixture, targeted),
      );
    }
    const intensityEffect = rule.intensityEffect;
    if (intensityEffect === NO_EFFECT) {
      look.scale = STEADY;
    } else if (intensityEffect !== undefined) {
      const { spread } = intensityEffect;
      const targeted = patch.fixtures.filter((other) => ruleTargets(patch, other, rule));
      const delay = spreadDelay(spread, fixture, targeted);
      look.scale = intensityScale(intensityEffect, beat, delay, spreadPositions(spread, targeted), {
        id: fixture.id,
        targeted: targeted.map((other) => other.id),
      });
    }
    const colourEffect = rule.colourEffect;
    if (colourEffect === NO_EFFECT) {
      look.effectColour = NO_EFFECT;
    } else if (colourEffect !== undefined) {
      const targeted = patch.fixtures.filter((other) => ruleTargets(patch, other, rule));
      const delay = spreadDelay(colourEffect.spread, fixture, targeted);
      look.effectColour = mixLevels(colourEffectMix(colourEffect, beat, delay), slots);
    }
  }
  return look;
}

function mixLevels({ from, to, p }: ColourMix, slots: SlotLevels): ColourLevels {
  return blend(ruleLevels(from, slots), ruleLevels(to, slots), p);
}

// The colour of every slot: the held Colour Set's, crossfading when it
// changes. Without a held Colour Set, every slot is the Default Colour.
export type SlotLevels = Record<Slot, ColourLevels>;

// What a Rule's colour shows: a Colour's levels, or the slot's colour.
function ruleLevels(colour: RuleColour, slots: SlotLevels): ColourLevels {
  return isSlotRef(colour) ? slots[colour.slot] : colourLevels(colour);
}

// Every slot at the Default Colour.
export function defaultSlots(show: Show): SlotLevels {
  const levels = defaultColour(show);
  return { Primary: levels, Secondary: levels, Accent: levels };
}

export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export function blend(a: ColourLevels, b: ColourLevels, p: number): ColourLevels {
  const levels = {
    red: lerp(a.red, b.red, p),
    green: lerp(a.green, b.green, p),
    blue: lerp(a.blue, b.blue, p),
    uv: lerp(a.uv, b.uv, p),
  };
  // Between two kelvin whites the temperature fades; otherwise it is a mix.
  return a.kelvin !== undefined && b.kelvin !== undefined
    ? { ...levels, kelvin: lerp(a.kelvin, b.kelvin, p) }
    : levels;
}

// A colour as red, green, blue and ultraviolet levels, each 0–1. Red, green
// and blue stand in for ultraviolet on Fixtures without a UV emitter. A white
// in kelvin also keeps its temperature, for Fixtures that can make it exactly.
export interface ColourLevels {
  red: number;
  green: number;
  blue: number;
  uv: number;
  kelvin?: number;
}

const rgbLevels = (red: number, green: number, blue: number): ColourLevels => ({
  red,
  green,
  blue,
  uv: 0,
});

const WHITE = rgbLevels(1, 1, 1);

const SWATCH_LEVELS: Record<Swatch, ColourLevels> = {
  Red: rgbLevels(1, 0, 0),
  Orange: rgbLevels(1, 0.5, 0),
  Amber: rgbLevels(1, 0.75, 0),
  Yellow: rgbLevels(1, 1, 0),
  Green: rgbLevels(0, 1, 0),
  Cyan: rgbLevels(0, 1, 1),
  Blue: rgbLevels(0, 0, 1),
  Lavender: rgbLevels(0.6, 0.4, 1),
  Magenta: rgbLevels(1, 0, 1),
  Pink: rgbLevels(1, 0.4, 0.7),
  White: WHITE,
  'Warm White': rgbLevels(1, 0.85, 0.6),
  UV: { red: 0.3, green: 0, blue: 1, uv: 1 },
};

export function colourLevels(colour: Colour): ColourLevels {
  if ('kelvin' in colour) return { ...kelvinRgb(colour.kelvin), kelvin: colour.kelvin };
  return 'swatch' in colour ? SWATCH_LEVELS[colour.swatch] : hsv(colour.hue, colour.saturation);
}

// A white of `kelvin` as red, green and blue at full value (Tanner Helland's
// blackbody approximation).
function kelvinRgb(kelvin: number): ColourLevels {
  const t = kelvin / 100;
  const byte = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return rgbLevels(byte(red), byte(green), byte(blue));
}

// The emitter levels of a kelvin white on a Fixture with warm and cold white
// emitters: they crossfade, the warmer or the cooler one at full.
function cctMix(kelvin: number): EmitterMix {
  const cool = kelvinFraction(kelvin);
  return { warmWhite: Math.min(1, 2 * (1 - cool)), coldWhite: Math.min(1, 2 * cool) };
}

// Hue and saturation at full value.
function hsv(hue: number, saturation: number): ColourLevels {
  const channel = (n: number) => {
    const k = (n + hue / 60) % 6;
    return 1 - saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbLevels(channel(5), channel(3), channel(1));
}

type EmitterMix = Partial<Record<Emitter, number>>;

// The colour of an amber emitter.
const AMBER = SWATCH_LEVELS.Amber;

// The colour each kind of emitter gives out.
const EMITTER_LEVELS: Record<Emitter, ColourLevels> = {
  red: SWATCH_LEVELS.Red,
  green: SWATCH_LEVELS.Green,
  blue: SWATCH_LEVELS.Blue,
  white: WHITE,
  warmWhite: SWATCH_LEVELS['Warm White'],
  coldWhite: rgbLevels(0.85, 0.9, 1),
  amber: AMBER,
  lime: rgbLevels(0.75, 1, 0),
  cyan: SWATCH_LEVELS.Cyan,
  magenta: SWATCH_LEVELS.Magenta,
  yellow: SWATCH_LEVELS.Yellow,
  indigo: rgbLevels(0.3, 0, 1),
  uv: SWATCH_LEVELS.UV,
};

// The emitter levels that make `colour` on a Fixture with `emitters`. A UV
// emitter takes the ultraviolet. White, then amber, take as much of the rest
// as they can; red, green and blue mix what is left.
function emitterMix(colour: ColourLevels, emitters: Set<Emitter>): EmitterMix {
  let { red, green, blue } = colour;
  const mix: EmitterMix = {};
  if (emitters.has('uv')) {
    mix.uv = colour.uv;
    red *= 1 - colour.uv;
    green *= 1 - colour.uv;
    blue *= 1 - colour.uv;
  }
  if (emitters.has('white')) {
    mix.white = Math.min(red, green, blue);
    red -= mix.white;
    green -= mix.white;
    blue -= mix.white;
  }
  if (emitters.has('amber')) {
    mix.amber = Math.min(red / AMBER.red, green / AMBER.green);
    red -= mix.amber * AMBER.red;
    green -= mix.amber * AMBER.green;
  }
  return { ...mix, red, green, blue };
}

// Whether a Fixture's emitters can make colours. Without red, green and blue,
// colour is ignored and the emitters carry intensity only.
function mixesColour(emitters: Set<Emitter>): boolean {
  return emitters.has('red') && emitters.has('green') && emitters.has('blue');
}

function fullMix(emitters: Set<Emitter>): EmitterMix {
  return Object.fromEntries([...emitters].map((e) => [e, 1]));
}

// What a Fixture is set to once the Layers are combined.
interface FixtureOutput {
  intensity: number;
  // The Show's default colour when no Rule sets one.
  colour: ColourLevels;
  emitters: Set<Emitter>;
  mix: EmitterMix;
  // Scales the emitters; carries intensity on Fixtures without a dimmer.
  emitterScale: number;
  // A moving Fixture's Direction, and its pan and tilt.
  direction?: Direction;
  aim?: AimAngles;
  // The strobe rate in Hz, and what it sets on each strobe channel, by
  // channel name. Absent while steady.
  strobe?: { hz: number; drives: Map<string, StrobeDrive> };
  // The prism and gobo settings, and the gobo slot the Venue Patch picks for
  // the Fixture. Absent while neither is set.
  goboPrism?: { prism?: PrismSetting; gobo?: GoboSetting; slot?: string };
}

// The DMX values of a Fixture's channels, offset 0 first.
function encodeChannels(channels: Channel[], output: FixtureOutput): number[] {
  return encodeControls(
    channels,
    (channel) => channelPoint(channel, output),
    output.aim && aimDmx(channels, output.aim),
  );
}

// The DMX values of `channels`, offset 0 first: each control channel set where
// `pointOf` says, or left at its default when it says undefined. A control
// channel with fine channels is set with 16-bit precision. `overrides` (by offset) values
// win over both.
export function encodeControls(
  channels: Channel[],
  pointOf: (channel: Extract<Channel, { kind: 'control' }>) => Point | undefined,
  overrides?: Map<number, number>,
): number[] {
  const fineNames = new Set(channels.flatMap((c) => (c.kind === 'fine' ? [c.of] : [])));
  const values = new Map<string, number>();
  for (const channel of channels) {
    if (channel.kind !== 'control') continue;
    const point = pointOf(channel);
    if (point) values.set(channel.name, toDmx(point, fineNames.has(channel.name)));
  }
  return channels.map((channel, offset) => {
    const set = overrides?.get(offset);
    if (set !== undefined) return set;
    if (channel.kind === 'unused') return 0;
    if (channel.kind === 'control') {
      const value = values.get(channel.name);
      return value === undefined
        ? channel.defaultValue
        : fineNames.has(channel.name)
          ? dmxByte(value, 0)
          : value;
    }
    const value = values.get(channel.of);
    if (value === undefined) return channel.defaultValue;
    return dmxByte(value, channel.byte);
  });
}

// Where a control channel is set, or undefined to leave it at its default.
function channelPoint(
  channel: Extract<Channel, { kind: 'control' }>,
  { intensity, colour, mix, emitterScale, strobe, goboPrism }: FixtureOutput,
): Point | undefined {
  const { ranges } = channel;
  const slots = ranges.filter((r) => r.capability.type === 'wheelSlot');
  if (slots.length > 0) return fixed(middle(nearestSlot(slots, colour)));
  const goboPrismSet =
    goboPrism && goboPrismDrive(channel, goboPrism.gobo, goboPrism.slot, goboPrism.prism);
  if (goboPrismSet) return goboPrismPoint(goboPrismSet);
  const drive = strobe?.drives.get(channel.name);
  if (drive) return drive.kind === 'on' ? fixed(middle(drive.range)) : ratePoint(drive, strobe!.hz);
  const open = ranges.find(
    (r) => r.capability.type === 'shutter' && r.capability.effect === 'open',
  );
  if (open) return fixed(middle(open));
  const dimmer = ranges.filter((r) => r.capability.type === 'intensity');
  if (dimmer.length > 0) return levelPoint(dimmer, intensity);
  if (ranges.some((r) => r.capability.type === 'colourTemperature')) {
    return colour.kelvin === undefined ? undefined : kelvinPoint(ranges, colour.kelvin);
  }
  const emitter = ranges.find((r) => r.capability.type === 'emitter')?.capability;
  if (emitter?.type !== 'emitter') return undefined;
  const same = ranges.filter(
    (r) => r.capability.type === 'emitter' && r.capability.emitter === emitter.emitter,
  );
  return levelPoint(same, (mix[emitter.emitter] ?? 0) * emitterScale);
}

// The point that sets `kelvin` on colour temperature `ranges`: the first range
// whose span holds it, or else the nearest. A reversed span is walked
// backwards.
function kelvinPoint(ranges: CapabilityRange[], kelvin: number): Point {
  const span = ({ capability }: CapabilityRange): [number, number] =>
    (capability.type === 'colourTemperature' && capability.kelvin) || [...KELVIN_RANGE];
  const off = (range: CapabilityRange) => {
    const [a, b] = span(range);
    return Math.max(Math.min(a, b) - kelvin, kelvin - Math.max(a, b), 0);
  };
  const range = ranges.reduce((best, r) => (off(r) < off(best) ? r : best));
  return { from: range.from, to: range.to, t: kelvinFraction(kelvin, span(range)) };
}

// The point that sets `level` (0–1) on intensity, emitter, haze or fan
// `ranges`. Each range's `level` span says how output varies across it. The
// first range whose span holds `level` is used, or else the first range.
export function levelPoint(ranges: CapabilityRange[], level: number): Point {
  const span = ({ capability }: CapabilityRange): [number, number] =>
    ((capability.type === 'intensity' ||
      capability.type === 'emitter' ||
      isHazeOrFan(capability)) &&
      capability.level) || [0, 1];
  const holds = (range: CapabilityRange) => {
    const [a, b] = span(range);
    return Math.min(a, b) <= level && level <= Math.max(a, b);
  };
  const range = ranges.find(holds) ?? ranges[0]!;
  const [a, b] = span(range);
  const t = a === b ? 0 : clamp((level - a) / (b - a));
  return { from: range.from, to: range.to, t };
}

// The point a gobo or prism drive sets: the middle of a range, or a rotation
// speed clamped to the nearest range's span (the whole channel when it gives
// none). A reversed span is walked backwards.
function goboPrismPoint(drive: GoboPrismDrive): Point {
  if (drive.kind === 'range') return fixed(middle(drive.range));
  const off = (range: CapabilityRange) => {
    const [a, b] = rotationSpan(range);
    return Math.max(Math.min(a, b) - drive.speed, drive.speed - Math.max(a, b), 0);
  };
  const range = drive.ranges.reduce((best, r) => (off(r) < off(best) ? r : best));
  const [a, b] = rotationSpan(range);
  const t = a === b ? 0 : clamp((drive.speed - a) / (b - a));
  return { from: range.from, to: range.to, t };
}

// The point that sets `hz` on strobe `ranges`, clamped to their Hz span, or
// to the assumed span for a range without one. The first range whose span
// holds `hz` is used, or else the nearest.
function ratePoint({ ranges }: Extract<StrobeDrive, { kind: 'rate' }>, hz: number): Point {
  const span = (range: CapabilityRange) => hzSpan(range) ?? ASSUMED_STROBE_HZ;
  const off = (range: CapabilityRange) => {
    const [a, b] = span(range);
    return Math.max(Math.min(a, b) - hz, hz - Math.max(a, b), 0);
  };
  const range = ranges.reduce((best, r) => (off(r) < off(best) ? r : best));
  const [a, b] = span(range);
  const t = a === b ? 0 : clamp((hz - a) / (b - a));
  return { from: range.from, to: range.to, t };
}

function middle({ from, to }: CapabilityRange): number {
  return Math.floor((from + to) / 2);
}

// The wheel slot range whose colour is closest to `colour`. A kelvin white
// only considers white and CTO/CTB slots, when the wheel has any.
function nearestSlot(slots: CapabilityRange[], colour: ColourLevels): CapabilityRange {
  if (colour.kelvin !== undefined) {
    const whites = slots.filter(isWhiteSlot);
    if (whites.length > 0) slots = whites;
  }
  const distance = (range: CapabilityRange) => {
    const slot = slotLevels(range);
    return (
      (slot.red - colour.red) ** 2 +
      (slot.green - colour.green) ** 2 +
      (slot.blue - colour.blue) ** 2
    );
  };
  return slots.reduce((best, range) => (distance(range) < distance(best) ? range : best));
}

// Whether a wheel slot is a white: open, named white or CTO/CTB/CTC, or a
// pale colour (saturation at most 0.5).
function isWhiteSlot(range: CapabilityRange): boolean {
  if (range.capability.type !== 'wheelSlot') return true;
  if (/\b(white|open|cto|ctb|ctc|ct\d*)\b|\d{4}\s*k/i.test(range.capability.slot.name)) return true;
  const { red, green, blue } = slotLevels(range);
  const max = Math.max(red, green, blue);
  return max === 0 || (max - Math.min(red, green, blue)) / max <= 0.5;
}

// A wheel slot range's colour; white for any other range.
function slotLevels({ capability }: CapabilityRange): ColourLevels {
  return capability.type === 'wheelSlot' ? hexLevels(capability.slot.colour) : WHITE;
}

// '#rrggbb' as ColourLevels.
function hexLevels(hex: string): ColourLevels {
  const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return rgbLevels(byte(1), byte(3), byte(5));
}
