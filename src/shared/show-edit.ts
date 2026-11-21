// Applying a ShowEdit to a Show. The one place a Show changes: the engine's
// Show session and the renderer's test fakes both call applyShowEdit.
import { editProblem, moveListed, putListed, removeListed } from './preset-list';
import {
  findTrigger,
  sameNote,
  showHazePresets,
  showHousePresets,
  validateShow,
  type Colour,
  type Direction,
  type HazePreset,
  type HousePreset,
  type Layer,
  type MidiNote,
  type Scene,
  type Show,
  type ShowResult,
  type Trigger,
} from './show';

// A change to the current Show.
export type ShowEdit =
  | { type: 'putScene'; scene: Scene }
  | { type: 'removeScene'; id: string }
  | { type: 'putLayer'; layer: Layer }
  // Removes the Layer's Scenes too.
  | { type: 'removeLayer'; id: string }
  | { type: 'setBaseLook'; sceneId?: string }
  // Without a colour, the default is White.
  | { type: 'setDefaultColour'; colour?: Colour }
  // Without a Direction, the default is Down.
  | { type: 'setDefaultDirection'; direction?: Direction }
  // Replaces the Trigger on the same channel and note.
  | { type: 'putTrigger'; trigger: Trigger }
  | { type: 'removeTrigger'; note: MidiNote }
  // Adds at the end, or replaces the House Preset with the same id in place.
  | { type: 'putHousePreset'; preset: HousePreset }
  // Moves the House Preset to index `to`.
  | { type: 'moveHousePreset'; id: string; to: number }
  | { type: 'removeHousePreset'; id: string }
  // Adds at the end, or replaces the Haze Preset with the same id in place.
  | { type: 'putHazePreset'; preset: HazePreset }
  // Moves the Haze Preset to index `to`.
  | { type: 'moveHazePreset'; id: string; to: number }
  | { type: 'removeHazePreset'; id: string };

// Applies one edit to a Show. Returns the new Show, or the errors that refused
// the edit.
export function applyShowEdit(show: Show, edit: ShowEdit): ShowResult {
  switch (edit.type) {
    case 'putScene':
      return putScene(show, edit.scene);
    case 'removeScene':
      if (!show.scenes.some((s) => s.id === edit.id)) {
        return { errors: [`Scene id "${edit.id}" is not in the Show`] };
      }
      return { show: removeScene(show, edit.id) };
    case 'putLayer':
      return putLayer(show, edit.layer);
    case 'removeLayer':
      if (!show.layers.some((l) => l.id === edit.id)) {
        return { errors: [`Layer id "${edit.id}" is not in the Show`] };
      }
      return { show: removeLayer(show, edit.id) };
    case 'setBaseLook':
      return setBaseLook(show, edit.sceneId);
    case 'setDefaultColour':
      return setDefaultColour(show, edit.colour);
    case 'setDefaultDirection':
      return setDefaultDirection(show, edit.direction);
    case 'putTrigger':
      return putTrigger(show, edit.trigger);
    case 'removeTrigger': {
      const { channel, note } = edit.note;
      if (!findTrigger(show, edit.note)) {
        return { errors: [`No Trigger is mapped to channel ${channel}, note ${note}`] };
      }
      return { show: removeTrigger(show, edit.note) };
    }
    case 'putHousePreset':
      return putHousePreset(show, edit.preset);
    case 'moveHousePreset': {
      const problem = editProblem('House Preset', showHousePresets(show), edit.id, edit.to);
      return problem ? { errors: [problem] } : { show: moveHousePreset(show, edit.id, edit.to) };
    }
    case 'removeHousePreset': {
      const problem = editProblem('House Preset', showHousePresets(show), edit.id);
      return problem ? { errors: [problem] } : { show: removeHousePreset(show, edit.id) };
    }
    case 'putHazePreset':
      return putHazePreset(show, edit.preset);
    case 'moveHazePreset': {
      const problem = editProblem('Haze Preset', showHazePresets(show), edit.id, edit.to);
      return problem ? { errors: [problem] } : { show: moveHazePreset(show, edit.id, edit.to) };
    }
    case 'removeHazePreset': {
      const problem = editProblem('Haze Preset', showHazePresets(show), edit.id);
      return problem ? { errors: [problem] } : { show: removeHazePreset(show, edit.id) };
    }
    default: {
      const unhandled: never = edit;
      throw new Error(`Unhandled Show edit: ${JSON.stringify(unhandled)}`);
    }
  }
}

// Adds a Scene, or replaces the one with the same id.
function putScene(show: Show, scene: Scene): ShowResult {
  return validated({ ...show, scenes: put(show.scenes, scene, (s) => s.id === scene.id) });
}

// Removes a Scene with the Triggers that fire it. If it was the Base Look, the Show is left without one.
function removeScene(show: Show, id: string): Show {
  const { baseLook, ...rest } = show;
  return {
    ...rest,
    scenes: show.scenes.filter((s) => s.id !== id),
    triggers: show.triggers.filter((t) => t.scene !== id),
    ...(baseLook !== undefined && baseLook !== id ? { baseLook } : {}),
  };
}

// Adds a Layer at the end, or replaces the one with the same id in place.
function putLayer(show: Show, layer: Layer): ShowResult {
  return validated({ ...show, layers: put(show.layers, layer, (l) => l.id === layer.id) });
}

// Removes a Layer together with its Scenes.
function removeLayer(show: Show, id: string): Show {
  const layers = show.layers.filter((l) => l.id !== id);
  const onLayer = show.scenes.filter((s) => s.layer === id);
  return onLayer.reduce((rest, scene) => removeScene(rest, scene.id), { ...show, layers });
}

// Designates a Scene as the Base Look; undefined leaves the Show without one.
function setBaseLook(show: Show, sceneId: string | undefined): ShowResult {
  const next = { ...show, baseLook: sceneId };
  if (sceneId === undefined) delete next.baseLook;
  return validated(next);
}

// Sets the colour Fixtures show where no Rule sets one; undefined leaves it
// White.
function setDefaultColour(show: Show, colour: Colour | undefined): ShowResult {
  const next = { ...show, defaultColour: colour };
  if (colour === undefined) delete next.defaultColour;
  return validated(next);
}

// Sets the Direction moving Fixtures aim at where no Rule sets one;
// undefined leaves it Down.
function setDefaultDirection(show: Show, direction: Direction | undefined): ShowResult {
  const next = { ...show, defaultDirection: direction };
  if (direction === undefined) delete next.defaultDirection;
  return validated(next);
}

// Maps a channel and note, replacing the Trigger already on them.
function putTrigger(show: Show, trigger: Trigger): ShowResult {
  return validated({ ...show, triggers: put(show.triggers, trigger, (t) => sameNote(t, trigger)) });
}

function removeTrigger(show: Show, note: MidiNote): Show {
  return { ...show, triggers: show.triggers.filter((t) => !sameNote(t, note)) };
}

// Adds a House Preset at the end, or replaces the one with the same id in
// place.
function putHousePreset(show: Show, preset: HousePreset): ShowResult {
  return validated({ ...show, housePresets: putListed(showHousePresets(show), preset) });
}

// Moves a House Preset to index `to`.
function moveHousePreset(show: Show, id: string, to: number): Show {
  const list = showHousePresets(show);
  const moved = moveListed(list, id, to);
  return moved === list ? show : { ...show, housePresets: moved };
}

// Removes a House Preset; without any left, the Show has no list.
function removeHousePreset(show: Show, id: string): Show {
  return withPresets(show, 'housePresets', removeListed(showHousePresets(show), id));
}

// Adds a Haze Preset at the end, or replaces the one with the same id in
// place.
function putHazePreset(show: Show, preset: HazePreset): ShowResult {
  return validated({ ...show, hazePresets: putListed(showHazePresets(show), preset) });
}

// Moves a Haze Preset to index `to`.
function moveHazePreset(show: Show, id: string, to: number): Show {
  const list = showHazePresets(show);
  const moved = moveListed(list, id, to);
  return moved === list ? show : { ...show, hazePresets: moved };
}

// Removes a Haze Preset; without any left, the Show has no list.
function removeHazePreset(show: Show, id: string): Show {
  return withPresets(show, 'hazePresets', removeListed(showHazePresets(show), id));
}

// `items` with `item` in place of the one matching `same`, or appended.
function put<T>(items: T[], item: T, same: (other: T) => boolean): T[] {
  return items.some(same) ? items.map((other) => (same(other) ? item : other)) : [...items, item];
}

function validated(show: Show): ShowResult {
  const errors = validateShow(show);
  return errors.length > 0 ? { errors } : { show };
}

// The Show with the list replaced; without any left, the Show has no list.
type PresetKey = 'housePresets' | 'hazePresets';
type PresetOf<K extends PresetKey> = NonNullable<Show[K]>[number];

function withPresets<K extends PresetKey>(show: Show, key: K, list: PresetOf<K>[]): Show {
  const next = { ...show };
  delete next[key];
  return list.length > 0 ? { ...next, [key]: list } : next;
}
