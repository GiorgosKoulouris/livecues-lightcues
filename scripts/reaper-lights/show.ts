// The note map of an `.lcshow`: which Scene a plan name means, and the MIDI
// channel, note and Trigger mode that fires it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LightsError } from './errors';
import type { Plan } from './plan';

/** How a Trigger fires: Go and Flash fire a Scene, Release clears a Layer. */
export type TriggerMode = 'go' | 'flash' | 'release';
/** The modes a Scene is placed with. */
export type SceneMode = Exclude<TriggerMode, 'release'>;

/** One Trigger of the `.lcshow`: a MIDI note on a channel firing a Scene (or releasing its Layer). */
export interface Trigger {
  channel: number;
  note: number;
  scene: string;
  mode: TriggerMode;
}

export interface ShowScene {
  id: string;
  name: string;
  /** The Layer's key, e.g. `look` or `colourfx`. */
  layer: string;
  /** MIDI channel, 1-based. */
  channel: number;
  note: number;
  mode: SceneMode;
  /** CSS colours of the Scene's Rules, in order and without repeats. Empty when it sets none. */
  colours: string[];
  /** The Scene's tags (`dynamic`, `tier:drive`). Empty for a Show that has none. */
  tags: string[];
}

/** A Colour Set: Go only. It has a MIDI note only when the Show gives it one. */
export interface ShowColourSet {
  id: string;
  name: string;
  /** MIDI channel, 1-based. */
  channel?: number;
  note?: number;
}

export interface ShowLayer {
  key: string;
  name: string;
  channel: number;
  /** The note that releases the Layer, when the Show has one. */
  releaseNote?: number;
}

export class ShowError extends LightsError {}

type RawColour = { swatch: string } | { hue: number; saturation: number };
interface RawRule {
  colour?: RawColour;
  colourEffect?: { colours?: RawColour[] };
}

/** Display colours for the Show's swatches. */
const SWATCH_CSS: Record<string, string> = {
  Red: '#e53935',
  Orange: '#fb8c00',
  Amber: '#ffb300',
  Yellow: '#fdd835',
  Green: '#43a047',
  Cyan: '#00acc1',
  Blue: '#1e66f5',
  Lavender: '#9f8cd8',
  Magenta: '#d81b9a',
  Pink: '#f06292',
  White: '#f5f5f5',
  'Warm White': '#ffd9a0',
  UV: '#6a1bd0',
};

function cssColour(c: RawColour): string | undefined {
  if ('swatch' in c) return SWATCH_CSS[c.swatch];
  return `hsl(${c.hue} ${Math.round(c.saturation * 100)}% 50%)`;
}

function sceneColours(rules: RawRule[] = []): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    for (const c of [rule.colour, ...(rule.colourEffect?.colours ?? [])]) {
      const css = c && cssColour(c);
      if (css && !out.includes(css)) out.push(css);
    }
  }
  return out;
}

interface RawShow {
  layers?: { id: string; name: string }[];
  scenes?: { id: string; name: string; layer: string; tags?: string[]; rules?: RawRule[] }[];
  colourSets?: { id: string; name: string; note?: { channel: number; note: number } }[];
  triggers?: (Omit<Trigger, 'mode'> & { mode: string })[];
  baseLook?: string;
}

/** `Colour FX`, `colour-fx` and `colourfx` all read `colourfx`. */
export const layerKey = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export class ShowMap {
  readonly layers: ShowLayer[] = [];
  readonly scenes: ShowScene[] = [];
  readonly colourSets: ShowColourSet[] = [];
  /** The Scene the Show falls back to on its Look Layer, when it names one. */
  readonly baseLook?: ShowScene;

  constructor(raw: RawShow) {
    const triggers = raw.triggers ?? [];
    for (const scene of raw.scenes ?? []) {
      const t = triggers.find(
        (x) => x.scene === scene.id && (x.mode === 'go' || x.mode === 'flash'),
      );
      if (!t) continue;
      this.scenes.push({
        id: scene.id,
        name: scene.name,
        layer: layerKey(scene.layer),
        channel: t.channel,
        note: t.note,
        mode: t.mode as SceneMode,
        colours: sceneColours(scene.rules),
        tags: scene.tags ?? [],
      });
    }
    for (const set of raw.colourSets ?? []) {
      this.colourSets.push({
        id: set.id,
        name: set.name,
        channel: set.note?.channel,
        note: set.note?.note,
      });
    }
    for (const layer of raw.layers ?? []) {
      const key = layerKey(layer.id);
      const channel = this.scenes.find((s) => s.layer === key)?.channel;
      if (channel === undefined) continue;
      const release = triggers.find((t) => t.channel === channel && t.mode === 'release');
      this.layers.push({ key, name: layer.name, channel, releaseNote: release?.note });
    }
    this.baseLook = this.scenes.find((s) => s.id === raw.baseLook);
  }

  /** A Scene by name, case-insensitively. */
  scene(name: string): ShowScene | undefined {
    const wanted = name.trim().toLowerCase();
    return this.scenes.find((s) => s.name.toLowerCase() === wanted);
  }

  /** A Colour Set by name, case-insensitively. */
  colourSet(name: string): ShowColourSet | undefined {
    const wanted = name.trim().toLowerCase();
    return this.colourSets.find((s) => s.name.toLowerCase() === wanted);
  }

  /** The Go Scene that sets a Layer to rest: `Down` on Movement (`Chill: Down`). */
  downScene(layerKey: string): ShowScene | undefined {
    return this.scenes.find(
      (s) => s.layer === layerKey && s.mode === 'go' && /(^|[:\s])down$/i.test(s.name.trim()),
    );
  }

  /** A Layer by id or name, ignoring case and spacing. */
  layer(text: string): ShowLayer | undefined {
    const key = layerKey(text);
    return this.layers.find((l) => l.key === key || layerKey(l.name) === key);
  }
}

export function loadShow(json: string): ShowMap {
  let raw: RawShow;
  try {
    raw = JSON.parse(json) as RawShow;
  } catch {
    throw new ShowError('The Show file is not valid JSON');
  }
  if (!Array.isArray(raw.scenes) || !Array.isArray(raw.triggers)) {
    throw new ShowError('The Show file has no scenes or triggers');
  }
  return new ShowMap(raw);
}

export const DEFAULT_SHOW = 'shows/Energy.lcshow';

/** The Show a plan names (default `shows/Energy.lcshow`), found from the cwd or the plan's folder. */
export function loadShowFor(plan: Plan, planPath: string): ShowMap {
  const showRel = plan.show ?? DEFAULT_SHOW;
  const showPath = [resolve(showRel), resolve(dirname(planPath), showRel)].find(existsSync);
  if (!showPath) throw new ShowError(`Show file not found: ${showRel}`);
  return loadShow(readFileSync(showPath, 'utf8'));
}
