// The held Colour Set: which one the slot colours follow, and the crossfade
// between the slot colours when it changes. Slots resolve in Scenes, so the
// Scenes stay active across a change.
import type { EngineEvent, HeldColourSet } from '../shared/protocol';
import { SLOTS, showColourSets, findColourSet, type ColourSet, type Show } from '../shared/show';
import { crossfadeProgress, type Crossfade } from './crossfade';
import {
  blend,
  colourLevels,
  defaultSlots,
  type ColourLevels,
  type SlotLevels,
} from './scene-resolution';

export interface ColourSetOptions {
  show: () => Show;
  // Milliseconds.
  now: () => number;
  emit: (event: EngineEvent) => void;
}

// What a Colour Set shows: its slots' levels.
function setLevels(set: ColourSet): SlotLevels {
  return {
    Primary: colourLevels(set.colours.Primary),
    Secondary: colourLevels(set.colours.Secondary),
    Accent: colourLevels(set.colours.Accent),
  };
}

// Whether two Colour Sets show the same slot colours.
function sameColours(a: ColourSet, b: ColourSet): boolean {
  return JSON.stringify(a.colours) === JSON.stringify(b.colours);
}

// The Colour Set held, and the slot colours it gives: one holds at a time, the
// first when a Show is opened and at launch. A Show without Colour Sets holds
// none, and its slots show the Default Colour. Firing one crossfades every slot
// colour from where it is over the new set's fade.
export function createColourSets({ show, now, emit }: ColourSetOptions) {
  let held: HeldColourSet = {};
  let fade: Crossfade<SlotLevels> | undefined;
  // The held Colour Set as the fade was made, to see an edit of its colours.
  let shown: ColourSet | undefined;

  function seconds(): number {
    return now() / 1000;
  }

  function levelsNow(): SlotLevels {
    if (!fade) return defaultSlots(show());
    const p = crossfadeProgress(fade, seconds());
    const at = (slot: (typeof SLOTS)[number]): ColourLevels =>
      blend(fade!.from[slot], fade!.to[slot], p);
    return { Primary: at('Primary'), Secondary: at('Secondary'), Accent: at('Accent') };
  }

  function emitHeld(): void {
    emit({ type: 'colourSet', held });
  }

  // Holds `set`, its slots crossfading from where they are over its fade.
  function crossfade(set: ColourSet): void {
    fade = { from: levelsNow(), to: setLevels(set), since: seconds(), fade: set.fade };
    shown = set;
    held = { id: set.id };
    emitHeld();
  }

  // Holds the first Colour Set at once, or none if the Show has none.
  function holdFirst(): void {
    const [first] = showColourSets(show());
    fade = undefined;
    shown = first;
    held = first ? { id: first.id } : {};
    if (first) fade = { from: setLevels(first), to: setLevels(first), since: 0, fade: 0 };
    emitHeld();
  }

  return {
    // The first Colour Set, at once, when a Show is opened.
    reset: holdFirst,
    // Crossfades to the Colour Set. Does nothing when the Show lacks it.
    fire(id: string): void {
      const set = findColourSet(show(), id);
      if (set) crossfade(set);
    },
    // After the Show is edited. If the held Colour Set is gone, the first one
    // takes over, over its fade. If its colours changed, the slots crossfade to
    // them over its fade. With none held, the first holds once there is one.
    showEdited(): void {
      const sets = showColourSets(show());
      const current = held.id === undefined ? undefined : findColourSet(show(), held.id);
      if (!current) {
        const [first] = sets;
        if (first) crossfade(first);
        else if (held.id !== undefined) {
          fade = undefined;
          shown = undefined;
          held = {};
          emitHeld();
        }
      } else if (shown && !sameColours(shown, current)) {
        crossfade(current);
      } else {
        shown = current;
      }
    },
    // The held Colour Set, for the engine snapshot.
    snapshot: (): HeldColourSet => held,
    // Brings back the held Colour Set from a snapshot at once, with no fade.
    // One the Show lacks gives the first.
    restore(from: HeldColourSet): void {
      const set = from.id === undefined ? undefined : findColourSet(show(), from.id);
      if (!set) return holdFirst();
      fade = { from: setLevels(set), to: setLevels(set), since: 0, fade: 0 };
      shown = set;
      held = { id: set.id };
      emitHeld();
    },
    emitHeld,
    // The slot colours now, mid-fade too.
    slots: levelsNow,
  };
}
