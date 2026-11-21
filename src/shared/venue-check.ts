// What a Show needs from a Venue Patch that the rig only gives in part: the
// makings of the Venue Check. Pure, and shared so the editors can show it
// where the operator fixes it.
import { aimAt, type Approximation } from './aim';
import { kelvinSupport } from './kelvin';
import {
  DEFAULT_DIRECTION,
  DIRECTIONS,
  isSlotRef,
  ruleTargets,
  showColourSets,
  showHazePresets,
  showHousePresets,
  type Direction,
  type HazePreset,
  type HousePreset,
  type RuleColour,
  type Show,
} from './show';
import { hasGobo, hasPrism } from './gobo-prism';
import { engages, sceneSnap } from './snap-settings';
import { strobeDrives } from './strobe';
import {
  fixtureMode,
  fixtureMounting,
  houseLook,
  isMovingFixture,
  patchHazers,
  patchHouse,
  type PatchedFixture,
  type VenuePatch,
} from './venue-patch';

// A Direction a moving Fixture cannot be aimed at exactly, and why.
export interface ApproximatedAim {
  fixtureId: string;
  direction: Direction;
  approximations: Approximation[];
}

// Every moving Fixture × Direction the Show uses whose aim is approximated,
// in patch order, then Direction order.
export function approximatedAims(show: Show, patch: VenuePatch): ApproximatedAim[] {
  return patch.fixtures.flatMap((fixture) => fixtureApproximatedAims(show, patch, fixture));
}

// The Directions the Show uses that one Fixture only approximates, in
// Direction order; none unless it moves. A moving Fixture uses the Default
// Direction and the Directions of the Rules that target it.
export function fixtureApproximatedAims(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
): ApproximatedAim[] {
  if (!isMovingFixture(patch, fixture)) return [];
  const used = new Set<Direction>([show.defaultDirection ?? DEFAULT_DIRECTION]);
  for (const rule of show.scenes.flatMap((scene) => scene.rules)) {
    if (rule.direction && ruleTargets(patch, fixture, rule)) used.add(rule.direction);
  }
  return DIRECTIONS.flatMap((direction) => {
    if (!used.has(direction)) return [];
    const aim = aimAt({
      position: fixture,
      mounting: fixtureMounting(fixture),
      channels: fixtureMode(patch, fixture).channels,
      stage: patch.stage,
      direction,
    });
    const approximations = aim?.approximations ?? [];
    return approximations.length > 0 ? [{ fixtureId: fixture.id, direction, approximations }] : [];
  });
}

// Why a Fixture's strobe is approximated: it has no strobe channel, so it
// stays steady, or its strobe rate has no Hz span, so 1–20 Hz is assumed.
export type StrobeApproximation = 'noStrobeChannel' | 'assumedHzSpan';

// The Scenes that strobe a Fixture whose strobe is approximated, by id in
// Show order.
export interface ApproximatedStrobe {
  fixtureId: string;
  scenes: string[];
  approximation: StrobeApproximation;
}

// Every Fixture whose strobe the Show only approximates, in patch order.
export function approximatedStrobes(show: Show, patch: VenuePatch): ApproximatedStrobe[] {
  return patch.fixtures.flatMap((fixture) => fixtureApproximatedStrobe(show, patch, fixture) ?? []);
}

// The Scenes that strobe one Fixture, if its strobe is approximated. A Scene
// strobes it when the last of its Rules that targets it with a strobe rate
// sets one other than Off.
export function fixtureApproximatedStrobe(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
): ApproximatedStrobe | undefined {
  const scenes = show.scenes.filter((scene) => {
    return engages('strobe', sceneSnap(patch, fixture, scene).strobe);
  });
  if (scenes.length === 0) return undefined;
  const drives = [...strobeDrives(fixtureMode(patch, fixture).channels).values()];
  const approximated = (approximation: StrobeApproximation) => ({
    fixtureId: fixture.id,
    scenes: scenes.map((s) => s.id),
    approximation,
  });
  if (drives.length === 0) return approximated('noStrobeChannel');
  if (drives.some((d) => d.kind === 'rate' && d.assumed)) return approximated('assumedHzSpan');
  return undefined;
}

// A Fixture that can only approximate the Show's kelvin whites: it has only a
// colour wheel, so the nearest white or CTO/CTB slot is used. `scenes` are the
// Scenes (by id, in Show order) whose Rules give it a kelvin colour;
// `defaultColour` is set when the Show's Default Colour is one.
export interface ApproximatedKelvin {
  fixtureId: string;
  scenes: string[];
  defaultColour: boolean;
}

// Every Fixture whose kelvin whites the Show only approximates, in patch order.
export function approximatedKelvins(show: Show, patch: VenuePatch): ApproximatedKelvin[] {
  return patch.fixtures.flatMap((fixture) => fixtureApproximatedKelvin(show, patch, fixture) ?? []);
}

// One Fixture's kelvin approximation, if it has a wheel and no way to mix or
// set a temperature, and the Show uses a kelvin white on it.
export function fixtureApproximatedKelvin(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
): ApproximatedKelvin | undefined {
  if (kelvinSupport(fixtureMode(patch, fixture).channels) !== 'wheel') return undefined;
  // A slot is a kelvin white when any Colour Set has one in it.
  const isKelvin = (colour: RuleColour | undefined): boolean =>
    colour !== undefined &&
    (isSlotRef(colour)
      ? showColourSets(show).some((set) => 'kelvin' in set.colours[colour.slot])
      : 'kelvin' in colour);
  const scenes = show.scenes.filter((scene) =>
    scene.rules.some(
      (rule) =>
        ruleTargets(patch, fixture, rule) &&
        (isKelvin(rule.colour) ||
          (typeof rule.colourEffect === 'object' &&
            rule.colourEffect !== null &&
            'colours' in rule.colourEffect &&
            rule.colourEffect.colours.some(isKelvin))),
    ),
  );
  const defaultColour = isKelvin(show.defaultColour);
  if (scenes.length === 0 && !defaultColour) return undefined;
  return { fixtureId: fixture.id, scenes: scenes.map((s) => s.id), defaultColour };
}

// A Rule setting a Fixture can lack the hardware for: a prism or a gobo.
export type GoboPrismKind = 'prism' | 'gobo';

// The Scenes that set Prism or Gobo on a Fixture with no prism or gobo wheel,
// so it stays as it is; by id in Show order.
export interface UnsupportedGoboPrism {
  fixtureId: string;
  kind: GoboPrismKind;
  scenes: string[];
}

// The Scenes that set Prism or Gobo on one Fixture without the hardware, in
// Prism, Gobo order; surfaced as a note on the Fixture, not as a Venue-wide
// list. A Scene sets Prism or Gobo on it when the last of its Rules that
// targets it with that setting sets one other than Off or Open.
export function fixtureUnsupportedGoboPrisms(
  show: Show,
  patch: VenuePatch,
  fixture: PatchedFixture,
): UnsupportedGoboPrism[] {
  const { channels } = fixtureMode(patch, fixture);
  const lacking: [GoboPrismKind, boolean][] = [
    ['prism', !hasPrism(channels)],
    ['gobo', !hasGobo(channels)],
  ];
  return lacking.flatMap(([kind, lacks]) => {
    if (!lacks) return [];
    const scenes = show.scenes.filter((scene) => {
      return engages(kind, sceneSnap(patch, fixture, scene)[kind]);
    });
    return scenes.length > 0
      ? [{ fixtureId: fixture.id, kind, scenes: scenes.map((s) => s.id) }]
      : [];
  });
}

// The Show's House Presets this Venue Patch has no house look for, in Show
// order: not set up in this venue, so firing them does nothing.
export function unsetHousePresets(show: Show, patch: VenuePatch): HousePreset[] {
  return showHousePresets(show).filter((preset) => !houseLook(patch, preset.id));
}

// The House Preset ids this Venue Patch has a house look for that the Show
// lacks, in patch order. The looks are kept, for another Show.
export function lookPresetsNotInShow(show: Show, patch: VenuePatch): string[] {
  const ids = new Set(showHousePresets(show).map((p) => p.id));
  return Object.keys(patchHouse(patch).looks ?? {}).filter((id) => !ids.has(id));
}

// The Show's Haze Presets when this Venue Patch has no Hazer, in Show order:
// not set up in this venue, so firing them does nothing.
export function hazePresetsWithoutHazers(show: Show, patch: VenuePatch): HazePreset[] {
  return patchHazers(patch).length === 0 ? showHazePresets(show) : [];
}
