// The Colour Set cues of a generated Plan (spec: Plan generator, Colour Sets).
// Main holds from bar 1, Break takes the break sections, Main returns after
// them and Swap takes the last chorus. A song with too few breaks lends Break a
// section, or 8 bars of one, so that it gets its 4 cues.
import { COLOUR_SET_CUES, PHRASE_BARS, TIERS, type Tier } from '../make-shows/rules';
import { isBreak, isStop, lastChorus, type Span } from './sections';

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
  sections.flatMap((section) => {
    const out: Unit[] = [{ bar: section.bar, section }];
    for (let at = PHRASE_BARS; at + 1 <= section.bars; at += PHRASE_BARS) {
      out.push({ bar: section.bar + at, section });
    }
    return out;
  });

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

/** The section that takes Swap: the last chorus, else the latest of the loudest. */
function swapSection(sections: Span[]): Span | undefined {
  const loudness = (s: Span) => TIERS.indexOf(s.tier as Tier);
  return (
    lastChorus(sections) ??
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

/** Which breaks get the Break set first, when 6 cues cannot take them all. */
const breakWeight = (s: Span): number => ['breakdown', 'bridge', 'break'].indexOf(s.kind);

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
  const weight = (run: Span[]) => Math.min(...run.map(breakWeight));
  return runs.toSorted((a, b) => weight(a) - weight(b));
}

export function planSetCues(sections: Span[]): SetCuePlan {
  const notes: string[] = [];
  const swapOn = swapSection(sections);
  const swap = swapBar(swapOn);
  if (swapOn && swap !== undefined && !lastChorus(sections)) {
    notes.push(`Colour Sets: no chorus, so Swap takes ${swapOn.label} at bar ${swap}`);
  }

  // A Swap inside the bar 1 section needs that section cut into phrases.
  let units = swapOn?.bar === 1 ? phrases(sections) : wholeSections(sections);
  /** The sections wholly on Break, and the units lent to it, each with its note. */
  const whole = new Set<Span>();
  const lent = new Map<Unit, string>();
  const cuesWith = (extra: (u: Unit) => boolean = () => false) =>
    walk(units, (u) => whole.has(u.section) || lent.has(u) || extra(u), swap);

  for (const run of breakRuns(sections)) {
    if (cuesWith((u) => run.includes(u.section)).length <= COLOUR_SET_CUES.max) {
      for (const section of run) whole.add(section);
    } else {
      notes.push(
        `Colour Sets: ${run[0]?.label} at bar ${run[0]?.bar} keeps the set held there, ` +
          `${COLOUR_SET_CUES.max} cues at most`,
      );
    }
  }

  // Too few cues: lend Break a solo, else the quietest unit before the Swap.
  const borrow = (): boolean => {
    const now = cuesWith().length;
    const options = units
      .filter((u) => u.bar > 1 && (swap === undefined || u.bar < swap))
      .filter((u) => !isStop(u.section.kind) && !whole.has(u.section) && !lent.has(u))
      .map((u) => ({ u, gain: cuesWith((other) => other === u).length - now }))
      .filter(({ gain }) => gain > 0 && now + gain <= COLOUR_SET_CUES.max);
    const solo = (u: Unit) => (u.section.kind === 'solo' ? 0 : 1);
    const loudness = (u: Unit) => TIERS.indexOf(u.section.tier as Tier);
    // Solo, then quietest, then the most cues, then the latest.
    const best = options.toSorted(
      (a, b) =>
        solo(a.u) - solo(b.u) ||
        loudness(a.u) - loudness(b.u) ||
        b.gain - a.gain ||
        b.u.bar - a.u.bar,
    )[0]?.u;
    if (!best) return false;
    const how = best.bar === best.section.bar ? 'at' : 'from';
    lent.set(best, `Colour Sets: Break borrows ${best.section.label} ${how} bar ${best.bar}`);
    return true;
  };
  const short = () => cuesWith().length < COLOUR_SET_CUES.min;
  while (short() && borrow());
  if (short()) {
    // Whole sections were not enough: borrow again, on 8-bar boundaries inside them.
    lent.clear();
    units = phrases(sections);
    while (short() && borrow());
  }

  const cues = cuesWith();
  const warnings = short()
    ? [
        `Only ${cues.length} Colour Set cue${cues.length === 1 ? '' : 's'}: ` +
          `too few bars before the Swap for ${COLOUR_SET_CUES.min}`,
      ]
    : [];
  return { cues, notes: [...notes, ...lent.values()], warnings };
}
