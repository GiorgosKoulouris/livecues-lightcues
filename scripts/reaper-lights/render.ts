// The timeline page: a plan and its compiled events as one self-contained HTML
// file. Section bands, a bar ruler and a lane per Layer with Scene names, hit
// ticks and the Scenes' colours from the Show, and a Density row for a tagged
// Show. Read-only; nothing in it is saved.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DENSITY_METRICS, PHRASE_BARS } from '../make-shows/rules';
import { compilePlan, type MidiEvent } from './compile';
import { densityReport, METRIC_NAMES, type SectionDensity } from './density';
import { parsePlan, type Plan } from './plan';
import { findRegion, readProject } from './rpp';
import { loadShowFor, type ShowLayer, type ShowMap } from './show';
import { stackingWarnings } from './stacking';
import { formatBarBeat, regionTimeline, type SongTimeline } from './timeline';

/** Pixels per second of song. */
const PX_PER_SECOND = 24;
/** A Flash tick is at least this wide, in pixels. */
const MIN_TICK_PX = 3;
const NEUTRAL = '#5b6270';

export interface RenderInput {
  plan: Plan;
  events: MidiEvent[];
  timeline: SongTimeline;
  show: ShowMap;
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);

const px = (seconds: number): string => `${Number((seconds * PX_PER_SECOND).toFixed(2))}px`;

function fill(colours: string[]): string {
  if (colours.length === 0) return NEUTRAL;
  if (colours.length === 1) return colours[0] as string;
  return `linear-gradient(90deg, ${colours.join(', ')})`;
}

function bands(timeline: SongTimeline): string {
  const { start, end } = timeline;
  const first = timeline.markers[0]?.time ?? end;
  // The stretch before the first marker is a band of its own.
  const spans = [
    ...(first - start > 1e-6 ? [{ name: 'Start', time: start }] : []),
    ...timeline.markers,
  ];
  return spans
    .map((m, i) => {
      const to = spans[i + 1]?.time ?? end;
      return `<div class="band b${i % 2}" style="left:${px(m.time - start)};width:${px(to - m.time)}"><span>${escapeHtml(m.name)}</span></div>`;
    })
    .join('');
}

function ruler(timeline: SongTimeline): string {
  const { start, end } = timeline;
  const count = Math.ceil(timeline.lengthInBars - 1e-6);
  const out: string[] = [];
  for (let bar = 1; bar <= count; bar++) {
    const from = timeline.timeAt({ bar, beat: 1 });
    const to = bar === count ? end : timeline.timeAt({ bar: bar + 1, beat: 1 });
    out.push(
      `<div class="bar" style="left:${px(from - start)};width:${px(to - from)}"><span>${bar}</span></div>`,
    );
  }
  return out.join('');
}

/** The Layers drawn: Look, Movement, Pulse, Colour FX and Hit. The Presets lane is left out when the Show has others. */
function laneLayers(show: ShowMap): ShowLayer[] {
  const others = show.layers.filter((l) => l.key !== 'presets');
  return others.length > 0 ? others : show.layers;
}

function lane(layer: ShowLayer, events: MidiEvent[], input: RenderInput): string {
  const { timeline, show } = input;
  const total = timeline.end - timeline.start;
  const own = events.filter((e) => e.layer === layer.key);
  const items: string[] = [];
  // A Go holds until the next Go or Release on the Layer, else to the song end.
  const holds = own.filter((e) => e.kind !== 'flash');
  holds.forEach((e, i) => {
    if (e.kind === 'release') {
      items.push(
        `<div class="tick rel" style="left:${px(e.time)};width:${MIN_TICK_PX}px" title="Release"></div>`,
      );
      return;
    }
    const next = holds[i + 1];
    const name = e.scene ?? '';
    const colours = show.scene(name)?.colours ?? [];
    const title = `${escapeHtml(name)} at ${formatBarBeat(e.at)}`;
    items.push(
      `<div class="scene" style="left:${px(e.time)};width:${px((next?.time ?? total) - e.time)};background:${fill(colours)}" title="${title}"><span>${escapeHtml(name)}</span></div>`,
    );
  });
  for (const e of own.filter((x) => x.kind === 'flash')) {
    const name = e.scene ?? '';
    const colour = show.scene(name)?.colours[0] ?? '#ffffff';
    const width = Math.max(MIN_TICK_PX, e.duration * PX_PER_SECOND);
    const title = `${escapeHtml(name)} at ${formatBarBeat(e.at)}`;
    items.push(
      `<div class="tick" style="left:${px(e.time)};width:${Number(width.toFixed(2))}px;background:${colour}" title="${title}"></div>`,
    );
  }
  return `<div class="row lane" data-lane="${escapeHtml(layer.name)}"><div class="label">${escapeHtml(layer.name)}</div><div class="track">${items.join('')}</div></div>`;
}

/** The Density row's colours: below a floor, above a ceiling, within, not scored. */
const DENSITY_FILL = { below: '#9b2c2c', above: '#8a6416', within: '#2f6b3c', none: NEUTRAL };

function densityBlock(s: SectionDensity): string {
  const off = DENSITY_METRICS.filter((m) => s.scores && s.scores[m] !== 2);
  const state = !s.scores
    ? 'none'
    : off.some((m) => s.scores?.[m] === 0)
      ? 'below'
      : off.length > 0
        ? 'above'
        : 'within';
  const marks = off.map((m) => `${METRIC_NAMES[m]}${s.scores?.[m] === 0 ? '↓' : '↑'}`);
  const tier = s.tier ? s.tier.charAt(0).toUpperCase() + s.tier.slice(1) : undefined;
  const text = tier ? `${tier}: ${marks.join(' ') || 'ok'}` : 'Not scored';
  const rates = DENSITY_METRICS.map((m) => {
    const rate = Number(((s.counts[m] * PHRASE_BARS) / s.bars).toFixed(2));
    return `${METRIC_NAMES[m]} ${s.counts[m]} (${rate} per ${PHRASE_BARS} bars)`;
  });
  const title = [`${s.name} at ${s.bar}: ${text}`, ...rates].join('\n');
  return `<div class="scene" style="left:${px(s.time)};width:${px(s.duration)};background:${DENSITY_FILL[state]}" title="${escapeHtml(title)}"><span>${escapeHtml(text)}</span></div>`;
}

/** A block per section with its Density scores. Empty for a Show that is not scored. */
function densityRow({ plan, events, show, timeline }: RenderInput): string {
  const sections = densityReport(plan, events, show, timeline)?.sections ?? [];
  if (sections.length === 0) return '';
  return `\n<div class="row lane" data-lane="Density"><div class="label">Density</div><div class="track">${sections.map(densityBlock).join('')}</div></div>`;
}

const STYLE = `
:root{color-scheme:dark;--bg:#14161a;--fg:#e6e8ec;--muted:#98a0ad;--line:#2b2f37;--lane:#1c1f25;--b0:#232833;--b1:#2c3240;--label:150px}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f6f7f9;--fg:#1b1e24;--muted:#5d6572;--line:#d3d7de;--lane:#ffffff;--b0:#e4e8ef;--b1:#d6dce7}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}
p{margin:0 0 12px;color:var(--muted)}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--lane)}
.row{display:flex;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.label{position:sticky;left:0;z-index:2;flex:none;width:var(--label);box-sizing:border-box;padding:6px 10px;background:var(--lane);border-right:1px solid var(--line);color:var(--muted);font-weight:600}
.track{position:relative;flex:none;height:34px;width:var(--width)}
.ruler .track{height:22px}
.sections .track{height:28px}
.band,.bar,.scene,.tick{position:absolute;top:0;bottom:0;box-sizing:border-box;overflow:hidden;white-space:nowrap}
.band span{display:block;padding:4px 6px;font-weight:600}
.b0{background:var(--b0)}
.b1{background:var(--b1)}
.band{border-left:2px solid var(--muted)}
.bar{border-left:1px solid var(--line);color:var(--muted);font-size:11px}
.bar span{padding:3px 4px;display:block}
.scene{top:4px;bottom:4px;border-radius:3px;border-left:2px solid var(--bg)}
.scene span{display:inline-block;margin:2px 4px;padding:0 5px;border-radius:2px;background:rgba(0,0,0,.65);color:#fff;font-size:12px}
.tick{top:4px;bottom:4px;border-radius:2px;outline:1px solid rgba(0,0,0,.55)}
.tick.rel{background:var(--muted);top:12px;bottom:12px}
`;

/** The whole page as a string. */
export function renderTimeline(input: RenderInput): string {
  const { plan, events, timeline, show } = input;
  const total = timeline.end - timeline.start;
  const barCount = Number(timeline.lengthInBars.toFixed(2));
  const lanes = laneLayers(show)
    .map((layer) => lane(layer, events, input))
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(plan.song)} lights</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(plan.song)}</h1>
<p>${barCount} bars, ${events.length} MIDI events</p>
<div class="scroll" style="--width:${px(total)}">
<div class="row sections"><div class="label">Sections</div><div class="track">${bands(timeline)}</div></div>
<div class="row ruler"><div class="label">Bar</div><div class="track">${ruler(timeline)}</div></div>${densityRow(input)}
${lanes}
</div>
</body>
</html>
`;
}

/** `<Song>.lights.html` next to the plan, whatever the plan is called: `Song.lights.yaml`, `Song.yaml` and `Song` all give `Song.lights.html`. */
export function htmlPathFor(planPath: string): string {
  const song = basename(planPath)
    .replace(/\.ya?ml$/i, '')
    .replace(/\.lights$/i, '');
  return join(dirname(planPath), `${song}.lights.html`);
}

export interface RenderOptions {
  rpp: string;
  plan: string;
  /** Called with each stacking (M4) and Density warning. The page is written either way. */
  onWarning?: (message: string) => void;
}

/** Compiles the plan and writes the timeline next to it. Returns the path written. */
export function renderLights(opts: RenderOptions): string {
  const project = readProject(readFileSync(opts.rpp, 'utf8'));
  const plan = parsePlan(readFileSync(opts.plan, 'utf8'));
  const timeline = regionTimeline(project, findRegion(project, plan.song));
  const show = loadShowFor(plan, opts.plan);
  const events = compilePlan(plan, show, timeline);
  for (const w of stackingWarnings(plan, events, show, timeline)) opts.onWarning?.(w.message);
  for (const w of densityReport(plan, events, show, timeline)?.warnings ?? []) opts.onWarning?.(w);
  const output = htmlPathFor(opts.plan);
  writeFileSync(output, renderTimeline({ plan, events, timeline, show }));
  return output;
}
