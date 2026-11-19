// The ordered, id-keyed lists of Presets in a Show: House Presets and Haze
// Presets. They share one shape, so their list edits, checks and the
// messages for them live here.
import type { MidiNote } from './show';

// What every kind of Preset has.
export interface ListedPreset {
  // Unique in the list.
  id: string;
  name: string;
  note?: MidiNote;
}

// Adds a Preset at the end, or replaces the one with the same id in place.
export function putListed<P extends ListedPreset>(list: P[], preset: P): P[] {
  const same = (other: P) => other.id === preset.id;
  return list.some(same) ? list.map((other) => (same(other) ? preset : other)) : [...list, preset];
}

// Moves a Preset to index `to`. A list without the id is returned as it is.
export function moveListed<P extends ListedPreset>(list: P[], id: string, to: number): P[] {
  const moved = [...list];
  const from = moved.findIndex((p) => p.id === id);
  if (from < 0) return list;
  moved.splice(to, 0, ...moved.splice(from, 1));
  return moved;
}

// The list without the Preset.
export function removeListed<P extends ListedPreset>(list: P[], id: string): P[] {
  return list.filter((p) => p.id !== id);
}

// The Preset a channel and note fire, if any.
export function findListedOn<P extends ListedPreset>(list: P[], note: MidiNote): P | undefined {
  return list.find((p) => p.note?.channel === note.channel && p.note.note === note.note);
}

// Why a move or a remove cannot be done, or undefined when it can. `label` is
// the kind of Preset, such as "House Preset". Without `to` it checks a remove.
export function editProblem<P extends ListedPreset>(
  label: string,
  list: P[],
  id: string,
  to?: number,
): string | undefined {
  if (!list.some((p) => p.id === id)) return `${label} id "${id}" is not in the Show`;
  if (to !== undefined && (!Number.isInteger(to) || to < 0 || to >= list.length)) {
    return `${label} position ${to} is not in the list`;
  }
  return undefined;
}

// What is wrong with one Preset's id and name. `at` leads each message.
export function presetProblems({ id, name }: ListedPreset, at: string): string[] {
  const problems: string[] = [];
  if (typeof id !== 'string' || id === '') problems.push(`${at}id is missing`);
  if (typeof name !== 'string' || name.trim() === '') problems.push(`${at}name is empty`);
  return problems;
}

// What is wrong with the list as a whole: an id or a note used twice, or more
// than `max` Presets.
export function listProblems<P extends ListedPreset>(
  label: string,
  list: P[],
  max: number,
): string[] {
  const problems: string[] = [];
  for (const id of repeated(list.map((p) => p.id))) {
    problems.push(`${label} id "${id}" is used twice`);
  }
  const notes = list.flatMap(({ note }) => (note ? [`${note.channel}/${note.note}`] : []));
  for (const key of repeated(notes)) problems.push(`${label} note ${key} is used twice`);
  if (list.length > max) problems.push(`${label}s: at most ${max}`);
  return problems;
}

function repeated<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const again = new Set<T>();
  for (const value of values) (seen.has(value) ? again : seen).add(value);
  return [...again];
}
