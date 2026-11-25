// The sections file: the sections and tiers the user confirmed for one song, the
// input of `lights:song generate`. Every error names its line.
//
//   sections:
//     - { bar: 1, label: intro, tier: chill }
//     - { bar: 28, label: stop }
//
// `bar` is a whole song bar, rising down the list. `label` is a Marker vocabulary
// label, trailing numbers allowed. `tier` is chill, groove, drive or peak. A stop
// or blackout takes none, and a breakdown with none is Peak.
import { isSeq } from 'yaml';
import { TIERS, type Tier } from '../make-shows/rules';
import { PlanError, Reader } from './plan';
import { EVENT_MARKERS, MARKER_VOCABULARY, matchMarker, type MarkerKind } from './vocabulary';

export interface Section {
  /** The line in the sections file. */
  line: number;
  bar: number;
  /** The label as written. */
  label: string;
  kind: MarkerKind;
  /** Absent only on a stop or blackout that gives none. */
  tier?: Tier;
}

/** The sections that hold the stage dark and need no tier. */
export const isStop = (kind: MarkerKind): boolean => kind === 'stop' || kind === 'blackout';

const KEYS = ['bar', 'label', 'tier'];

function readSection(r: Reader, item: unknown): Section {
  const node = r.map(item, 'Each of sections');
  const line = r.line(node) ?? 0;
  const found = new Map<string, string>();
  for (const entry of r.entries(node)) {
    if (!KEYS.includes(entry.key)) throw new PlanError(`Unknown key '${entry.key}'`, entry.line);
    found.set(entry.key, r.text(entry.value, entry.key, entry.value));
  }
  const need = (key: string): string => {
    const value = found.get(key);
    if (value === undefined) throw new PlanError(`A section needs a '${key}'`, line);
    return value;
  };
  const barText = need('bar');
  if (!/^[1-9]\d*$/.test(barText)) {
    throw new PlanError('bar must be a whole number from 1', line);
  }
  const label = need('label');
  const kind = matchMarker(label);
  if (!kind) {
    const known = MARKER_VOCABULARY.filter((k) => !EVENT_MARKERS.includes(k)).join(', ');
    throw new PlanError(`Unknown label '${label}'. Use one of: ${known}`, line);
  }
  if (EVENT_MARKERS.includes(kind)) {
    throw new PlanError(`'${label}' starts no section`, line);
  }
  const section: Section = { line, bar: Number(barText), label, kind };
  const tierText = found.get('tier');
  if (tierText !== undefined) {
    const tier = TIERS.find((t) => t === tierText.toLowerCase());
    if (!tier)
      throw new PlanError(`Unknown tier '${tierText}'. Use one of: ${TIERS.join(', ')}`, line);
    section.tier = tier;
  } else if (kind === 'breakdown') section.tier = 'peak';
  else if (!isStop(kind)) throw new PlanError(`Section '${label}' needs a 'tier'`, line);
  return section;
}

/** Parses and checks a sections file. Bars are checked against the song by the generator. */
export function parseSections(text: string): Section[] {
  const r = new Reader(text);
  const top = r.map(r.root, 'The sections file');
  let list: Section[] | undefined;
  for (const { key, value, line } of r.entries(top)) {
    if (key !== 'sections') throw new PlanError(`Unknown key '${key}'`, line);
    const items = isSeq(value) ? value.items : [];
    if (items.length === 0) throw new PlanError('sections must list at least one section', line);
    list = items.map((item) => readSection(r, item));
  }
  if (!list) throw new PlanError("The sections file needs 'sections'", r.line(top));
  list.forEach((section, i) => {
    const before = list[i - 1];
    if (before && section.bar <= before.bar) {
      throw new PlanError(`bar ${section.bar} is not after bar ${before.bar}`, section.line);
    }
  });
  return list;
}
