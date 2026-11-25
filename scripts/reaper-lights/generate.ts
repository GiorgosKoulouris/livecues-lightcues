// The Plan generator (ADR 0024): fills each confirmed section of a song to its
// tier's Density from the Show's tagged Scenes, and writes the result as a normal
// Plan. The counts come from the same bands the Density lint scores against.
// The same inputs give the same Plan.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cueSheetPath, songRolesBeside } from '../make-shows/song-sets';
import { analyseRegion, isDrumStem } from './analyse';
import { GenerateError } from './errors';
import { PlanError } from './plan';
import { placeHits, type HitEvent, type Hits } from './hits';
import { cap, Looks, RELEASE, type Picks } from './looks';
import { findRegion, readProject, type Region, type RppProject } from './rpp';
import { isStop, lastChorus, parseSections, type Section, type Span } from './sections';
import { planSetCues, type SetRole } from './set-cues';
import { loadShow, showPathFor, tierTag, type ShowMap } from './show';
import { EVENT_MARKERS, matchMarker } from './vocabulary';
import { regionTimeline, type SongTimeline } from './timeline';

/** A section needs at least this many bars of song to start in. */
const MIN_SECTION_BARS = 0.25;

/** The sections with their lengths, checked against the song's. */
function spans(sections: Section[], timeline: SongTimeline): Span[] {
  const total = timeline.lengthInBars;
  return sections.map((section, i) => {
    if (total - (section.bar - 1) < MIN_SECTION_BARS) {
      throw new PlanError(
        `bar ${section.bar} is past the end of the song (${Number(total.toFixed(2))} bars)`,
        section.line,
      );
    }
    const next = sections[i + 1];
    const to = next ? Math.min(next.bar - 1, total) : total;
    return { ...section, bars: to - (section.bar - 1) };
  });
}

/** The sections with the last chorus raised to Peak, and what was raised. */
function peakAtTheEnd(sections: Span[]): { sections: Span[]; notes: string[] } {
  const last = lastChorus(sections);
  if (!last || last.tier === 'peak') return { sections, notes: [] };
  const from = last.tier ? cap(last.tier) : 'no tier';
  return {
    sections: sections.map((s) => (s === last ? { ...s, tier: 'peak' } : s)),
    notes: [`Bar ${last.bar}: ${last.label} raised from ${from} to Peak (the last chorus)`],
  };
}

/** Where the sections and the project markers disagree: `render` scores by marker. */
function markerWarnings(sections: Span[], timeline: SongTimeline): string[] {
  const markers = timeline.markers
    .filter((m) => !EVENT_MARKERS.some((k) => k === matchMarker(m.name)))
    .map((m) => ({ name: m.name, ...timeline.barBeatAt(m.time) }));
  const unmarked = sections
    .filter((s) => !markers.some((m) => m.bar === s.bar && m.beat === 1))
    .map(
      (s) =>
        `Bar ${s.bar}: no project marker for ${s.label}, so render does not score it as a section`,
    );
  const extra = markers
    .filter((m) => !sections.some((s) => s.bar === m.bar && m.beat === 1))
    .map((m) => `Bar ${m.bar}: marker ${m.name} has no section in the sections file`);
  return [...unmarked, ...extra];
}

const quote = (text: string): string => JSON.stringify(text);
const value = (text: string): string => (text === RELEASE ? RELEASE : quote(text));
const flow = (picks: Picks): string =>
  `{ ${Object.entries(picks)
    .map(([key, v]) => `${key}: ${value(v)}`)
    .join(', ')} }`;
const tierName = (s: Section): string => (s.tier && !isStop(s.kind) ? `, ${cap(s.tier)}` : '');

/** The Hit events as lines, one each, with a comment at each section. */
function eventLines(events: HitEvent[]): string[] {
  return events.flatMap((e, i) => {
    const span = e.until ? `until: ${quote(e.until)}` : `length: ${quote(e.length ?? '')}`;
    const line = `  - { at: ${quote(e.at)}, scene: ${quote(e.scene)}, ${span} }`;
    return e.section === events[i - 1]?.section ? [line] : [`  # ${e.section.label}`, line];
  });
}

/** The Plan as text: one line per pick and Hit, with a comment at each section. */
function planText(song: string, show: string, sections: Span[], looks: Looks, hits: Hits): string {
  const cues = looks.cues.flatMap((cue) => [
    ...(cue.section ? [`  # ${cue.section.label}${tierName(cue.section)}`] : []),
    `  - at: ${quote(String(cue.bar))}`,
    ...Object.entries(cue.picks).map(([key, v]) => `    ${key}: ${value(v)}`),
  ]);
  return [
    '# Written by `lights:song generate`. Edit the highlights by hand.',
    '# `generate --force` writes over those edits.',
    `song: ${quote(song)}`,
    `show: ${quote(show)}`,
    'brief:',
    '  sections:',
    ...sections.map((s) => `    - ${quote(`Bar ${s.bar}: ${s.label}${tierName(s)}`)}`),
    'cues:',
    ...cues,
    ...(hits.events.length > 0 ? ['events:', ...eventLines(hits.events)] : []),
    `end: ${flow(looks.end())}`,
    '',
  ].join('\n');
}

export interface GenerateOptions {
  rpp: string;
  region: string;
  /** The Show as the Plan names it. */
  show: string;
  /** The sections file. */
  sections: string;
  force: boolean;
}

export interface Generated {
  output: string;
  warnings: string[];
  /** What the generator did, to print. */
  notes: string[];
}

/** Runs `parse`, naming the sections file in its errors. */
function fromSectionsFile<T>(parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    if (e instanceof PlanError) throw new GenerateError(`Sections file: ${e.message}`);
    throw e;
  }
}

/** `Lights/<Song>.lights.yaml` beside the project. */
function planPathFor(rpp: string, song: string): string {
  const file = song.replace(/[\\/:*?"<>|]/g, '').trim() || 'Song';
  return join(dirname(rpp), 'Lights', `${file}.lights.yaml`);
}

/** The onsets of the Region's drum stems, and why any file was skipped. */
function drumStems(project: RppProject, region: Region, dir: string) {
  const tracks = project.tracks.filter((t) => isDrumStem(t.name));
  return analyseRegion({ ...project, tracks }, region, { dir });
}

interface ColourSetCues {
  /** Colour Set names by the bar they are cued on. */
  byBar: Map<number, string>;
  notes: string[];
  warnings: string[];
}

/** The Colour Sets the song's Cue Sheet row gives each role, cued where the sections ask. */
function colourSetCues(
  show: ShowMap,
  showFile: string,
  song: string,
  sections: Span[],
): ColourSetCues {
  if (show.colourSets.length === 0) {
    const none = 'The Show has no Colour Sets, so none is cued';
    return { byBar: new Map(), notes: [], warnings: [none] };
  }
  const sheet = cueSheetPath(showFile);
  const rows = songRolesBeside(showFile, (path) => readFileSync(path, 'utf8'));
  if (!rows) throw new GenerateError(`No Song sets table: generate needs it in ${sheet}`);
  const row = rows.find((r) => r.song.toLowerCase() === song.toLowerCase());
  if (!row) {
    const listed = rows.map((r) => r.song).join(', ');
    throw new GenerateError(`No Song sets row for '${song}' in ${sheet}. It lists: ${listed}`);
  }
  const names: Record<SetRole, string> = { main: row.main, break: row.break, swap: row.swap };
  for (const name of Object.values(names)) {
    const set = show.colourSet(name);
    if (!set) throw new GenerateError(`Colour Set '${name}' is not in the Show. Rebuild ${sheet}`);
    if (set.note === undefined) {
      throw new GenerateError(`Colour Set '${name}' has no MIDI note in the Show`);
    }
  }
  const { cues, notes, warnings } = planSetCues(sections);
  return { byBar: new Map(cues.map((c) => [c.bar, names[c.role]])), notes, warnings };
}

/** Writes the Plan of one song. It never writes over a Plan without `force`. */
export function generateLights(options: GenerateOptions): Generated {
  const project = readProject(readFileSync(options.rpp, 'utf8'));
  const region = findRegion(project, options.region);
  const timeline = regionTimeline(project, region);
  const output = planPathFor(options.rpp, region.name);
  if (!options.force && existsSync(output)) {
    throw new GenerateError(`${output} already exists. Pass --force to write over it`);
  }
  const showFile = showPathFor(options.show, output);
  const show = loadShow(readFileSync(showFile, 'utf8'));
  if (!show.scenes.some((s) => tierTag(s.tags) !== undefined)) {
    throw new GenerateError(
      `${options.show} is untagged: generate needs a Show with tier: tags (a generated band Show)`,
    );
  }
  const text = readFileSync(options.sections, 'utf8');
  const confirmed = fromSectionsFile(() => spans(parseSections(text), timeline));
  const { sections, notes: raised } = peakAtTheEnd(confirmed);

  const sets = colourSetCues(show, showFile, region.name, sections);
  const looks = new Looks(region.name, show, sections, sets.byBar);

  const drums = drumStems(project, region, dirname(options.rpp));
  const hits = placeHits({
    song: region.name,
    sections,
    colourRoom: looks.colourRoom,
    show,
    timeline,
    stems: drums.stems,
    elementsOf: (section, bars) => looks.elementsOf(section, bars),
  });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, planText(region.name, options.show, sections, looks, hits), {
    flag: options.force ? 'w' : 'wx',
  });
  const stems = drums.stems.map((s) => s.name).join(', ') || 'no drum stem found';
  const warnings = [
    ...markerWarnings(sections, timeline),
    ...drums.warnings,
    ...sets.warnings,
    ...(show.scenes.some((s) => s.mode === 'flash')
      ? []
      : ['The Show has no Hit Scenes, so no Hit is placed']),
  ];
  const notes = [
    ...raised,
    ...sets.notes,
    `Body Hits: ${hits.onStem} on drum stem onsets (${stems}), ${hits.onGrid} on the beat grid`,
  ];
  return { output, warnings, notes };
}
