// Applying a VenueEdit to a Venue Patch. The one place a Venue Patch changes:
// the engine's Venue session, the renderer's checks and its test fakes all call
// applyVenueEdit.
import { type FixtureProfile } from './fixture-profile';
import {
  addressedFixtures,
  normalRotation,
  patchHazers,
  patchHouse,
  validatePatch,
  type AddressedFixture,
  type Hazer,
  type House,
  type HouseGroup,
  type HouseLight,
  type HouseLook,
  withoutGroup,
  type PatchedFixture,
  type PatchResult,
  type StageBounds,
  type StagePosition,
  type Universe,
  type VenuePatch,
} from './venue-patch';

// A change to the current Venue Patch. `putFixture` and `putFixtures` embed a
// Fixture's Profile from the Profile Library when the patch does not have it
// yet. `putFixtures` changes several Fixtures at once, or none if one does not
// fit.
export type VenueEdit =
  | { type: 'setStage'; stage: StageBounds }
  // `addUniverse` rejects a number already in the patch; `putUniverse`
  // replaces that Universe.
  | { type: 'addUniverse'; universe: Universe }
  | { type: 'putUniverse'; universe: Universe }
  | { type: 'removeUniverse'; number: number }
  | { type: 'putFixture'; fixture: PatchedFixture }
  | { type: 'putFixtures'; fixtures: PatchedFixture[] }
  | { type: 'moveFixture'; id: string; position: StagePosition }
  | { type: 'removeFixtures'; ids: string[] }
  // Adds a House Group, or renames it.
  | { type: 'putHouseGroup'; group: HouseGroup }
  // Removes its House Lights and its Startup look setting too.
  | { type: 'removeHouseGroup'; id: string }
  // Embeds the House Light's Profile from the Profile Library, as for a
  // Fixture.
  | { type: 'putHouseLight'; light: HouseLight }
  | { type: 'removeHouseLights'; ids: string[] }
  // Embeds the Hazer's Profile from the Profile Library. Its mode needs a
  // haze channel.
  | { type: 'putHazer'; hazer: Hazer }
  | { type: 'removeHazers'; ids: string[] }
  // Without a look, the House Lights start at full white.
  | { type: 'setStartupLook'; look?: HouseLook }
  // The house look of the House Preset with id `preset`. Without a look, or
  // with one that sets no House Group, removes it.
  | { type: 'setHouseLook'; preset: string; look?: HouseLook };

// Applies `edit` to `patch`. `profile` is the Profile Library lookup, used to
// embed a Profile the patch does not have yet.
export function applyVenueEdit(
  patch: VenuePatch,
  edit: VenueEdit,
  profile: (id: string) => FixtureProfile | undefined,
): PatchResult {
  switch (edit.type) {
    case 'setStage':
      return setStage(patch, edit.stage);
    case 'addUniverse':
      return addUniverse(patch, edit.universe);
    case 'putUniverse':
      return putUniverse(patch, edit.universe);
    case 'removeUniverse':
      if (!patch.universes.some((u) => u.number === edit.number)) {
        return { errors: [`Universe ${edit.number} is not in the patch`] };
      }
      return { patch: removeUniverse(patch, edit.number) };
    case 'putFixture':
      return putFixture(patch, edit.fixture, profile(edit.fixture.profileId));
    case 'putFixtures':
      return putFixtures(patch, edit.fixtures, profile);
    case 'moveFixture':
      return moveFixture(patch, edit.id, edit.position);
    case 'removeFixtures': {
      const missing = edit.ids.find((id) => !patch.fixtures.some((f) => f.id === id));
      if (missing !== undefined) {
        return { errors: [`Fixture id "${missing}" is not in the patch`] };
      }
      return { patch: removeFixtures(patch, edit.ids) };
    }
    case 'putHouseGroup':
      return putHouseGroup(patch, edit.group);
    case 'removeHouseGroup':
      if (!patchHouse(patch).groups.some((g) => g.id === edit.id)) {
        return { errors: [`House Group "${edit.id}" is not in the patch`] };
      }
      return { patch: removeHouseGroup(patch, edit.id) };
    case 'putHouseLight':
      return putHouseLight(patch, edit.light, profile(edit.light.profileId));
    case 'removeHouseLights': {
      const { lights } = patchHouse(patch);
      const missing = edit.ids.find((id) => !lights.some((l) => l.id === id));
      if (missing !== undefined) {
        return { errors: [`House Light id "${missing}" is not in the patch`] };
      }
      return { patch: removeHouseLights(patch, edit.ids) };
    }
    case 'putHazer':
      return putHazer(patch, edit.hazer, profile(edit.hazer.profileId));
    case 'removeHazers': {
      const hazers = patchHazers(patch);
      const missing = edit.ids.find((id) => !hazers.some((h) => h.id === id));
      if (missing !== undefined) return { errors: [`Hazer id "${missing}" is not in the patch`] };
      return { patch: removeHazers(patch, edit.ids) };
    }
    case 'setStartupLook':
      return setStartupLook(patch, edit.look);
    case 'setHouseLook':
      return setHouseLook(patch, edit.preset, edit.look);
    default: {
      const unhandled: never = edit;
      throw new Error(`Unhandled Venue edit: ${JSON.stringify(unhandled)}`);
    }
  }
}

// Adds a Fixture, or replaces the one with the same id. A Profile the patch
// already embeds is kept as is; otherwise `profile` is embedded.
function putFixture(
  patch: VenuePatch,
  fixture: PatchedFixture,
  profile?: FixtureProfile,
): PatchResult {
  if (profile && profile.id !== fixture.profileId) {
    return {
      errors: [
        `"${fixture.name}": Profile "${profile.id}" given for Profile "${fixture.profileId}"`,
      ],
    };
  }
  return putFixtures(patch, [fixture], () => profile);
}

// Adds or replaces several Fixtures in one change, checked as a whole: either
// all go in or none do. `profileOf` gives the Profile to embed for a Fixture
// whose Profile the patch has no copy of yet.
function putFixtures(
  patch: VenuePatch,
  fixtures: PatchedFixture[],
  profileOf: (id: string) => FixtureProfile | undefined = () => undefined,
): PatchResult {
  const profiles = [...patch.profiles];
  for (const { profileId } of fixtures) {
    const profile = profiles.some((p) => p.id === profileId) ? undefined : profileOf(profileId);
    if (profile) profiles.push(profile);
  }
  fixtures = fixtures.map(withNormalRotation);
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const added = fixtures.filter((f) => !patch.fixtures.some((p) => p.id === f.id));
  const replaced = patch.fixtures.map((f) => byId.get(f.id) ?? f);
  return validated(dropUnusedProfiles({ ...patch, fixtures: [...replaced, ...added], profiles }));
}

// Brings a Mounting's rotation into 0 to under 360. A non-finite one is left
// for validation to reject.
function withNormalRotation(fixture: PatchedFixture): PatchedFixture {
  const { mounting } = fixture;
  if (!mounting || !Number.isFinite(mounting.rotation)) return fixture;
  const rotation = normalRotation(mounting.rotation);
  return rotation === mounting.rotation
    ? fixture
    : { ...fixture, mounting: { ...mounting, rotation } };
}

// Places a Fixture at `position`. Its Zone follows the new position unless it
// has a Zone override.
function moveFixture(patch: VenuePatch, id: string, position: StagePosition): PatchResult {
  const fixture = patch.fixtures.find((f) => f.id === id);
  if (!fixture) return { errors: [`Fixture id "${id}" is not in the patch`] };
  const { x, y, height } = position;
  return putFixture(patch, { ...fixture, x, y, height });
}

function removeFixtures(patch: VenuePatch, ids: string[]): VenuePatch {
  return dropUnusedProfiles({
    ...patch,
    fixtures: patch.fixtures.filter((f) => !ids.includes(f.id)),
  });
}

function setStage(patch: VenuePatch, stage: StageBounds): PatchResult {
  return validated({ ...patch, stage });
}

// Adds a Universe, or replaces the one with the same number. Universes are
// kept in number order.
function putUniverse(patch: VenuePatch, universe: Universe): PatchResult {
  const others = patch.universes.filter((u) => u.number !== universe.number);
  const universes = [...others, universe].sort((a, b) => a.number - b.number);
  return validated({ ...patch, universes });
}

// Adds a Universe whose number is not in the patch yet. Unlike putUniverse,
// it never replaces one.
function addUniverse(patch: VenuePatch, universe: Universe): PatchResult {
  if (patch.universes.some((u) => u.number === universe.number)) {
    return { errors: [`Universe ${universe.number} is already in the patch`] };
  }
  return putUniverse(patch, universe);
}

// Removes a Universe together with its Fixtures, House Lights and Hazers.
function removeUniverse(patch: VenuePatch, number: number): VenuePatch {
  const hazers = patch.hazers?.filter((h) => h.universe !== number);
  const house = patch.house && {
    ...patch.house,
    lights: patch.house.lights.filter((l) => l.universe !== number),
  };
  return dropUnusedProfiles({
    ...patch,
    universes: patch.universes.filter((u) => u.number !== number),
    fixtures: patch.fixtures.filter((f) => f.universe !== number),
    ...(house && { house }),
    ...(hazers && { hazers }),
  });
}

// Adds a House Group, or renames the one with the same id.
function putHouseGroup(patch: VenuePatch, group: HouseGroup): PatchResult {
  const house = patchHouse(patch);
  const groups = house.groups.some((g) => g.id === group.id)
    ? house.groups.map((g) => (g.id === group.id ? group : g))
    : [...house.groups, group];
  return validated({ ...patch, house: { ...house, groups } });
}

// Removes a House Group together with its House Lights and its setting in
// the Startup look and every house look. A look left with no Group goes.
function removeHouseGroup(patch: VenuePatch, id: string): VenuePatch {
  const { groups, lights, startupLook, looks } = patchHouse(patch);
  const house: House = {
    groups: groups.filter((g) => g.id !== id),
    lights: lights.filter((l) => l.group !== id),
  };
  const look = startupLook && withoutGroup(startupLook, id);
  if (look) house.startupLook = look;
  const kept = Object.entries(looks ?? {}).flatMap(([preset, l]) => {
    const rest = withoutGroup(l, id);
    return rest ? [[preset, rest] as const] : [];
  });
  return dropUnusedProfiles({ ...patch, house: withLooks(house, kept) });
}

// Adds a House Light, or replaces the one with the same id. Its Profile is
// embedded as for a stage Fixture.
function putHouseLight(
  patch: VenuePatch,
  light: HouseLight,
  profile?: FixtureProfile,
): PatchResult {
  const embedded = embedProfile(patch, light, profile);
  if ('errors' in embedded) return embedded;
  const house = patchHouse(patch);
  const lights = putById(house.lights, light);
  return validated(dropUnusedProfiles({ ...patch, ...embedded, house: { ...house, lights } }));
}

// The patch's Profiles with `profile` added for `fixture` unless the patch
// already has a copy, or the errors when `profile` is not the Fixture's.
function embedProfile(
  patch: VenuePatch,
  fixture: AddressedFixture,
  profile?: FixtureProfile,
): { profiles: FixtureProfile[] } | { errors: string[] } {
  if (profile && profile.id !== fixture.profileId) {
    return {
      errors: [
        `"${fixture.name}": Profile "${profile.id}" given for Profile "${fixture.profileId}"`,
      ],
    };
  }
  const embeds = patch.profiles.some((p) => p.id === fixture.profileId);
  return { profiles: profile && !embeds ? [...patch.profiles, profile] : patch.profiles };
}

// `items` with `item` added at the end, or replacing the one with its id.
function putById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((other) => other.id === item.id)
    ? items.map((other) => (other.id === item.id ? item : other))
    : [...items, item];
}

// Removes House Lights, and the Profile copies no one uses any more.
function removeHouseLights(patch: VenuePatch, ids: string[]): VenuePatch {
  const house = patchHouse(patch);
  return dropUnusedProfiles({
    ...patch,
    house: { ...house, lights: house.lights.filter((l) => !ids.includes(l.id)) },
  });
}

// Adds a Hazer, or replaces the one with the same id. Its Profile is embedded
// as for a stage Fixture.
function putHazer(patch: VenuePatch, hazer: Hazer, profile?: FixtureProfile): PatchResult {
  const embedded = embedProfile(patch, hazer, profile);
  if ('errors' in embedded) return embedded;
  const hazers = putById(patchHazers(patch), hazer);
  return validated(dropUnusedProfiles({ ...patch, ...embedded, hazers }));
}

// Removes Hazers, and the Profile copies no one uses any more.
function removeHazers(patch: VenuePatch, ids: string[]): VenuePatch {
  const hazers = patchHazers(patch).filter((h) => !ids.includes(h.id));
  const next: VenuePatch = { ...patch, hazers };
  if (hazers.length === 0) delete next.hazers;
  return dropUnusedProfiles(next);
}

// Sets the house look sent from launch; undefined leaves the House Lights at
// full white.
function setStartupLook(patch: VenuePatch, look: HouseLook | undefined): PatchResult {
  const house = { ...patchHouse(patch), startupLook: look };
  if (look === undefined) delete house.startupLook;
  return validated({ ...patch, house });
}

// Sets the house look of the House Preset with id `preset`. Undefined, or a
// look with no Group, removes it.
function setHouseLook(patch: VenuePatch, preset: string, look: HouseLook | undefined): PatchResult {
  if (preset === '') return { errors: ['A house look needs a House Preset id'] };
  const house = patchHouse(patch);
  // A Map keeps a replaced look in its place.
  const looks = new Map(Object.entries(house.looks ?? {}));
  if (look && Object.keys(look).length > 0) looks.set(preset, look);
  else looks.delete(preset);
  return validated({ ...patch, house: withLooks(house, [...looks]) });
}

// `house` with these house looks, by House Preset id; with none, no `looks`.
function withLooks(house: House, looks: (readonly [string, HouseLook])[]): House {
  const next: House = { ...house, looks: Object.fromEntries(looks) };
  if (looks.length === 0) delete next.looks;
  return next;
}

function dropUnusedProfiles(patch: VenuePatch): VenuePatch {
  const used = new Set(addressedFixtures(patch).map((f) => f.profileId));
  return { ...patch, profiles: patch.profiles.filter((p) => used.has(p.id)) };
}

function validated(patch: VenuePatch): PatchResult {
  const errors = validatePatch(patch);
  return errors.length > 0 ? { errors } : { patch };
}
