// The marker vocabulary a plan's section labels are matched against.

export const MARKER_VOCABULARY = [
  'intro',
  'verse',
  'pre',
  'build',
  'chorus',
  'drop',
  'break',
  'breakdown',
  'bridge',
  'solo',
  'outro',
  'roll',
  'endroll',
  'hit',
  'blackout',
  'stop',
] as const;

export type MarkerKind = (typeof MARKER_VOCABULARY)[number];

/** The markers that place an event inside a section and start none. */
export const EVENT_MARKERS: readonly MarkerKind[] = ['roll', 'endroll', 'hit'];

/** The label lower-cased, trimmed, without trailing digits: `Chorus2` is `chorus`. */
export function normaliseLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_-]*\d+$/, '');
}

/** The vocabulary entry a marker label names, or undefined for an unknown label. */
export function matchMarker(label: string): MarkerKind | undefined {
  const key = normaliseLabel(label);
  return MARKER_VOCABULARY.find((k) => k === key);
}
