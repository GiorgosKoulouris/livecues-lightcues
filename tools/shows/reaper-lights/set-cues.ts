// The Colour Set cues of a generated Plan (spec: Plan generator, Colour Sets).
// Main holds from bar 1, Break takes the break sections, Main returns after
// them and Swap takes the last chorus. A song with too few breaks lends Break a
// section, or 8 bars of one, so that it gets its 4 cues.
import { COLOUR_SET_CUES, PHRASE_BARS } from '../make-shows/rules';
import { breakRank, isBreak, isStop, lastChorus, loudness, places, type Span } from './sections';

export type SetRole = 'main' | 'break' | 'swap';

export interface SetCue {
  bar: number;
  role: SetRole;
}

export interface SetCuePlan {
  cues: SetCue[];
  /** What was borrowed or stood in, to print. */
  notes: string[];
  warnings: string[];
}

/** A stretch a role can be cued on: a section, or 8 bars of one. */
interface Unit {
  bar: number;
  section: Span;
}

const wholeSections = (sections: Span[]): Unit[] =>
  sections.map((section) => ({ bar: section.bar, section }));

/** Each section cut at every 8th bar that has a whole bar left to light. */
const phrases = (sections: Span[]): Unit[] =>
  sections.flatMap((section) =>
    places(section.bars, PHRASE_BARS).map((at) => ({ bar: section.bar + at, section })),
  );

/** A cue wherever the role changes, unit by unit. */
function walk(units: Unit[], onBreak: (unit: Unit) => boolean, swap: number | undefined): SetCue[] {
  const cues: SetCue[] = [{ bar: 1, role: 'main' }];
  let held: SetRole = 'main';
  for (const unit of units) {
    const { bar } = unit;
    if (bar === 1) continue;
    const role: SetRole = onBreak(unit)
      ? 'break'
      : bar === swap
        ? 'swap'
        : held === 'break'
          ? 'main'
          : held;
    if (role === held) continue;
    cues.push({ bar, role });
    held = role;
  }
  return cues;
}

/** The section that takes Swap: the last chorus or drop, else the latest of the loudest. */
function swapSection(sections: Span[]): Span | undefined {
  return (
    lastChorus(sections) ??
    sections.findLast((s) => s.kind === 'drop') ??
    sections
      .filter((s) => !isStop(s.kind) && !isBreak(s.kind))
      .toSorted((a, b) => loudness(b) - loudness(a) || b.bar - a.bar)[0]
  );
}

/** The bar Swap is cued on. Bar 1 is Main's, so a section starting there swaps late. */
function swapBar(section: Span | undefined): number | undefined {
  if (!section) return undefined;
  if (section.bar > 1) return section.bar;
  const late = phrases([section]).at(-1)?.bar;
  return late === 1 ? undefined : late;
}

/** The break sections as runs of neighbours, the weightiest first. */
function breakRuns(sections: Span[]): Span[][] {
  const runs: Span[][] = [];
  sections.forEach((section, i) => {
    if (section.bar === 1 || !isBreak(section.kind)) return;
    const before = sections[i - 1];
    const run = runs.at(-1);
    if (run && before && run.at(-1) === before) run.push(section);
    else runs.push([section]);
  });
  const rank = (run: Span[]) => Math.min(...run.map((s) => breakRank(s.kind)));
  return runs.toSorted((a, b) => rank(a) - rank(b));
}

/**
 * The units Break borrows to reach the minimum, or none where no choice does.
 * A solo is tried first, then the quietest unit, the one that brings most cues
 * and the latest; the next one is tried where that leaves the song short.
 */
function borrowed(
  units: Unit[],
  swap: number | undefined,
  cueCount: (lent: readonly Unit[]) => number,
): Unit[] | undefined {
  const base = cueCount([]);
  const solo = (u: Unit) => (u.section.kind === 'solo' ? 0 : 1);
  const order = units
    .filter((u) => u.bar > 1 && (swap === undefined || u.bar < swap) && !isStop(u.section.kind))
    .map((u) => ({ u, gain: cueCount([u]) - base }))
    .toSorted(
      (a, b) =>
        solo(a.u) - solo(b.u) ||
        loudness(a.u.section) - loudness(b.u.section) ||
        b.gain - a.gain ||
        b.u.bar - a.u.bar,
    )
    .map(({ u }) => u);
  const search = (lent: Unit[]): Unit[] | undefined => {
    const now = cueCount(lent);
    if (now >= COLOUR_SET_CUES.min) return lent;
    for (const unit of order) {
      if (lent.includes(unit)) continue;
      // Every borrow brings a cue, so the search goes no deeper than the shortfall.
      const next = cueCount([...lent, unit]);
      if (next <= now || next > COLOUR_SET_CUES.max) continue;
      const found = search([...lent, unit]);
      if (found) return found;
    }
    return undefined;
  };
  return search([]);
}

export function planSetCues(sections: Span[]): SetCuePlan {
  const notes: string[] = [];
  const swapOn = swapSection(sections);
  const swap = swapBar(swapOn);
  if (swapOn && swap !== undefined && swapOn.kind !== 'chorus') {
    notes.push(`Colour Sets: no chorus, so Swap takes ${swapOn.label} at bar ${swap}`);
  }

  /** The sections wholly on Break. */
  const whole = new Set<Span>();
  const cuesFor = (units: Unit[], lent: readonly Unit[]) => {
    const taken = new Set(lent.map((u) => u.bar));
    return walk(units, (u) => whole.has(u.section) || taken.has(u.bar), swap);
  };
  // A Swap inside the bar 1 section needs that section cut into phrases.
  const sectionUnits = swapOn?.bar === 1 ? phrases(sections) : wholeSections(sections);

  for (const run of breakRuns(sections)) {
    for (const section of run) whole.add(section);
    if (cuesFor(sectionUnits, []).length <= COLOUR_SET_CUES.max) continue;
    for (const section of run) whole.delete(section);
    notes.push(
      `Colour Sets: ${run[0]?.label} at bar ${run[0]?.bar} keeps the set held there, ` +
        `${COLOUR_SET_CUES.max} cues at most`,
    );
  }

  // Too few cues: lend Break whole sections, else 8 bars of them.
  let cues = cuesFor(sectionUnits, []);
  for (const units of [sectionUnits, phrases(sections)]) {
    const lent = borrowed(units, swap, (extra) => cuesFor(units, extra).length);
    if (!lent) continue;
    cues = cuesFor(units, lent);
    for (const { bar, section } of lent.toSorted((a, b) => a.bar - b.bar)) {
      const how = bar === section.bar ? 'at' : 'from';
      notes.push(`Colour Sets: Break borrows ${section.label} ${how} bar ${bar}`);
    }
    break;
  }

  const warnings =
    cues.length < COLOUR_SET_CUES.min
      ? [
          `Only ${cues.length} Colour Set cue${cues.length === 1 ? '' : 's'}: ` +
            `too few bars before the Swap for ${COLOUR_SET_CUES.min}`,
        ]
      : [];
  return { cues, notes, warnings };
}
