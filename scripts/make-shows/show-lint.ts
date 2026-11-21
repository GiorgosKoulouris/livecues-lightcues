// Show lint: scores a Show file against the aesthetic rubric items that can be
// checked from the file (items 1-12 and 17 of the show generator research).
// Report-only. Thresholds live in `rules.ts`, which the generator shares.
//
// Tiers come from Scene tags (`tier:chill`, or a bare tier tag, or a `Chill: `
// name prefix); parts from `part:<name>` tags, else from what a Scene's Rules
// target; `dynamic` marks a Scene as dynamic, which an active Effect also
// does. An item that cannot be placed is "not scored".
import { loadShowFile } from '../../src/engine/show-file';
import { strobeHz } from '../../src/shared/strobe';
import {
  isSlotRef,
  NO_EFFECT,
  type EffectSlot,
  type Rule,
  type RuleColour,
  type RuleTarget,
  type Scene,
  type Show,
} from '../../src/shared/show';
import {
  BACK_ROWS,
  BEAM_ROLES,
  DARK_NAME,
  FRONT_ROWS,
  FX_ROLES,
  HUE_MERGE_DEG,
  hueGap,
  MAX_LOOKS_PER_TIER,
  MAX_SATURATED_HUES,
  MIN_TIER_CLIMB,
  NEAR_MISS_DEG,
  PALE_MAX_SATURATION,
  PARTIAL_SHARE,
  PARTS,
  REFERENCE_BPM,
  SATURATED_MIN_SATURATION,
  STROBE_MAX_HZ,
  SWATCH_HUE,
  TIER_BANDS,
  TIERS,
  UNLIT_FRONT_NAME,
  WASH_ROLES,
  type Part,
  type Tier,
} from './rules';

export type Score = 0 | 1 | 2;

export interface ItemResult {
  item: number;
  title: string;
  // Null: not scored.
  score: Score | null;
  // One line per failure, led by the Scene name.
  offenders: string[];
  // Why it is not scored, or what was checked.
  note?: string;
}

export interface LintReport {
  items: ItemResult[];
  total: number;
  max: number;
  scored: number;
}

/** The items whose score of 0 fails `--strict`. */
export const STRICT_ITEMS = [3, 4, 11] as const;

// ---------------------------------------------------------------- reading a Scene

const active = <E>(effect: EffectSlot<E> | undefined): effect is E =>
  effect !== undefined && effect !== NO_EFFECT;

const hasDynamicEffect = (rule: Rule): boolean =>
  active(rule.movementEffect) || active(rule.intensityEffect) || active(rule.colourEffect);

/** The tier a Scene belongs to, from its tags or its name. */
export function tierOf(scene: Scene): Tier | undefined {
  const isTier = (s: string): s is Tier => (TIERS as readonly string[]).includes(s);
  for (const tag of scene.tags) {
    const name = tag.toLowerCase().replace(/^tier:/, '');
    if (isTier(name)) return name;
  }
  const prefix = /^([a-z]+):/i.exec(scene.name)?.[1]?.toLowerCase();
  return prefix !== undefined && isTier(prefix) ? prefix : undefined;
}

/** How many kinds of dynamic Effect a Scene runs: movement, intensity, colour. */
export function dynamicKinds(scene: Scene): number {
  const kinds = new Set<string>();
  for (const rule of scene.rules) {
    if (active(rule.movementEffect)) kinds.add('movement');
    if (active(rule.intensityEffect)) kinds.add('intensity');
    if (active(rule.colourEffect)) kinds.add('colour');
  }
  return kinds.size;
}

const isDynamic = (scene: Scene): boolean =>
  scene.tags.includes('dynamic') || scene.rules.some(hasDynamicEffect);

/** Whether `target` takes in a stage part. An absent role or zone list takes in all. */
export function targetCovers(target: RuleTarget, part: Part): boolean {
  const roleIn = (roles: readonly string[]) =>
    target.roles === undefined || target.roles.some((r) => roles.includes(r));
  const zoneIn = (test: (z: NonNullable<RuleTarget['zones']>[number]) => boolean) =>
    target.zones === undefined || target.zones.some(test);
  const overhead = (rows: readonly string[]) =>
    zoneIn((z) => z.level === 'Overhead' && rows.includes(z.row));
  switch (part) {
    case 'front':
      return roleIn(WASH_ROLES) && overhead(FRONT_ROWS);
    case 'back':
      return roleIn(WASH_ROLES) && overhead(BACK_ROWS);
    case 'floor':
      return roleIn(WASH_ROLES) && zoneIn((z) => z.level === 'Floor');
    case 'beams':
      return roleIn(BEAM_ROLES);
    case 'fx':
      return roleIn(FX_ROLES);
  }
}

type Tone =
  { kind: 'pale' } | { kind: 'tint' } | { kind: 'hue'; hue: number | undefined; key: string };

function toneOf(colour: RuleColour | undefined): Tone {
  if (colour === undefined) return { kind: 'pale' };
  if (isSlotRef(colour)) {
    return colour.slot === 'Accent'
      ? { kind: 'pale' }
      : { kind: 'hue', hue: undefined, key: `slot:${colour.slot}` };
  }
  if ('kelvin' in colour) return { kind: 'pale' };
  if ('swatch' in colour) {
    const hue = SWATCH_HUE[colour.swatch];
    return hue === undefined ? { kind: 'pale' } : { kind: 'hue', hue, key: colour.swatch };
  }
  if (colour.saturation <= PALE_MAX_SATURATION) return { kind: 'pale' };
  if (colour.saturation >= SATURATED_MIN_SATURATION) {
    return { kind: 'hue', hue: colour.hue, key: `h${colour.hue}` };
  }
  return { kind: 'tint' };
}

interface PartState {
  intensity: number;
  tone: Tone;
}

/** What a Scene's Rules leave on each part: the last Rule to set a thing wins. */
function lookState(scene: Scene): Record<Part, PartState> {
  const state = Object.fromEntries(
    PARTS.map((p) => [p, { intensity: 0, tone: { kind: 'pale' } } satisfies PartState]),
  ) as Record<Part, PartState>;
  for (const rule of scene.rules) {
    for (const part of PARTS) {
      if (!targetCovers(rule.target, part)) continue;
      if (rule.intensity !== undefined) state[part].intensity = rule.intensity;
      if (rule.colour !== undefined) state[part].tone = toneOf(rule.colour);
    }
  }
  return state;
}

/** The parts a Scene lights: its `part:` tags if it has any, else what its Rules light. */
function litParts(scene: Scene): Part[] {
  const tagged = scene.tags.flatMap((t) => (t.startsWith('part:') ? [t.slice(5)] : []));
  if (tagged.length > 0) return PARTS.filter((p) => tagged.includes(p));
  const state = lookState(scene);
  return PARTS.filter((p) => state[p].intensity > 0);
}

/** The distinct saturated hues of a Look: hues within the merge distance count as one. */
function hueClusters(state: Record<Part, PartState>): { degrees: number[]; slots: string[] } {
  const degrees: number[] = [];
  const slots = new Set<string>();
  for (const part of PARTS) {
    const { intensity, tone } = state[part];
    if (intensity <= 0 || tone.kind !== 'hue') continue;
    if (tone.hue === undefined) slots.add(tone.key);
    else if (!degrees.some((d) => hueGap(d, tone.hue!) <= HUE_MERGE_DEG)) degrees.push(tone.hue);
  }
  return { degrees, slots: [...slots] };
}

// ---------------------------------------------------------------- scoring helpers

/** 2 with no failure, 1 when failures are within the partial share, else 0. Null with nothing to check. */
export function grade(failures: number, total: number): Score | null {
  if (total === 0) return null;
  if (failures === 0) return 2;
  return failures / total <= PARTIAL_SHARE ? 1 : 0;
}

interface Context {
  show: Show;
  // Scenes only a Flash fires: Hits.
  hits: Set<string>;
}

const lights = (scene: Scene): boolean => litParts(scene).length > 0;

type Check = (cx: Context) => Omit<ItemResult, 'item' | 'title'>;

function result(
  score: Score | null,
  offenders: string[],
  note?: string,
): Omit<ItemResult, 'item' | 'title'> {
  return note === undefined ? { score, offenders } : { score, offenders, note };
}

/** Failures out of the Scenes a check applies to. */
function sceneCheck(
  scenes: Scene[],
  fails: (scene: Scene) => string | undefined,
  none: string,
): Omit<ItemResult, 'item' | 'title'> {
  const offenders: string[] = [];
  for (const scene of scenes) {
    const why = fails(scene);
    if (why !== undefined) offenders.push(`${scene.name}: ${why}`);
  }
  return result(
    grade(offenders.length, scenes.length),
    offenders,
    scenes.length === 0 ? none : undefined,
  );
}

// Looks: static colour Scenes, not Hits and not dynamic.
const looks = (cx: Context): Scene[] =>
  cx.show.scenes.filter(
    (s) =>
      !cx.hits.has(s.id) &&
      !isDynamic(s) &&
      s.rules.some((r) => r.colour !== undefined) &&
      lights(s),
  );
const tierLooks = (cx: Context): Scene[] => looks(cx).filter((s) => tierOf(s) !== undefined);
const dynamicScenes = (cx: Context): Scene[] =>
  cx.show.scenes.filter((s) => !cx.hits.has(s.id) && isDynamic(s));

const needsTier = 'no Scene has a tier (tag tier:<name>)';

// ---------------------------------------------------------------- the items

const ITEMS: { item: number; title: string; check: Check }[] = [
  {
    item: 1,
    title: `At most ${MAX_SATURATED_HUES} saturated hues per Look`,
    check: (cx) =>
      sceneCheck(
        looks(cx),
        (s) => {
          const { degrees, slots } = hueClusters(lookState(s));
          const n = degrees.length + slots.length;
          return n > MAX_SATURATED_HUES ? `${n} saturated hues` : undefined;
        },
        'no Look sets a colour',
      ),
  },
  {
    item: 2,
    title: 'Hue pairs are complementary or analogous, not near-miss',
    check: (cx) => {
      const pairs = looks(cx).filter((s) => {
        const { degrees, slots } = hueClusters(lookState(s));
        return degrees.length === 2 && slots.length === 0;
      });
      return sceneCheck(
        pairs,
        (s) => {
          const [a, b] = hueClusters(lookState(s)).degrees as [number, number];
          const gap = hueGap(a, b);
          const [lo, hi] = NEAR_MISS_DEG;
          return gap >= lo && gap <= hi ? `hues ${Math.round(gap)} degrees apart` : undefined;
        },
        'no Look has two plain hues',
      );
    },
  },
  {
    item: 3,
    title: 'Front light is pale in every tier Look (file half)',
    check: (cx) => {
      const scenes = tierLooks(cx).filter((s) => lookState(s).front.intensity > 0);
      return sceneCheck(
        scenes,
        (s) => (lookState(s).front.tone.kind === 'hue' ? 'saturated front' : undefined),
        needsTier,
      );
    },
  },
  {
    item: 4,
    title: 'Front is lit in sung tier Looks (file half)',
    check: (cx) => {
      const scenes = tierLooks(cx).filter((s) => !UNLIT_FRONT_NAME.test(s.name));
      return sceneCheck(
        scenes,
        (s) => {
          const min = TIER_BANDS[tierOf(s)!].frontMin;
          const level = lookState(s).front.intensity;
          return level < min ? `front ${pct(level)}, needs ${pct(min)}` : undefined;
        },
        needsTier,
      );
    },
  },
  { item: 5, title: 'Tier levels climb, Peak apart from Drive', check: checkClimb },
  {
    item: 6,
    title: 'Chill Looks leave negative space (file half)',
    check: (cx) =>
      sceneCheck(
        tierLooks(cx).filter((s) => tierOf(s) === 'chill'),
        (s) => {
          const parts = litParts(s);
          return parts.length > TIER_BANDS.chill.maxParts
            ? `${parts.length} parts lit (${parts.join(', ')})`
            : undefined;
        },
        'no Chill Look',
      ),
  },
  {
    item: 7,
    title: 'No Movement, Pulse or Colour FX Scene targets the front',
    check: (cx) =>
      sceneCheck(
        dynamicScenes(cx),
        (s) => (targetsFront(s) ? 'targets the front' : undefined),
        'no dynamic Scene',
      ),
  },
  {
    item: 8,
    title: 'Effect size and length are inside the tier bands',
    check: (cx) =>
      sceneCheck(
        dynamicScenes(cx).filter(
          (s) =>
            tierOf(s) !== undefined &&
            s.rules.some((r) => active(r.movementEffect) || active(r.intensityEffect)),
        ),
        bandProblem,
        'no tiered Scene with a movement or intensity Effect',
      ),
  },
  { item: 9, title: 'Dynamic Layers stack within the tier cap', check: checkStacking },
  {
    item: 10,
    title: 'Look fades follow the tier, in beats',
    check: (cx) =>
      sceneCheck(
        tierLooks(cx),
        (s) => {
          const [lo, hi] = TIER_BANDS[tierOf(s)!].fadeBeats;
          const beats = fadeBeats(s);
          return beats < lo - 1e-9 || beats > hi + 1e-9
            ? `fade ${round(beats)} beats, wants ${lo}-${hi}`
            : undefined;
        },
        needsTier,
      ),
  },
  { item: 11, title: 'Strobe and square rates stay under the limit', check: checkStrobe },
  {
    item: 12,
    title: 'Base is neutral and still, Dark exists, a still Movement per tier',
    check: checkBasics,
  },
  { item: 17, title: 'Few Looks per tier', check: checkLookCount },
];

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const round = (n: number): number => Math.round(n * 100) / 100;

function targetsFront(scene: Scene): boolean {
  if (scene.tags.some((t) => t.startsWith('part:'))) return scene.tags.includes('part:front');
  return scene.rules.some((r) => hasDynamicEffect(r) && targetCovers(r.target, 'front'));
}

function fadeBeats(scene: Scene): number {
  return scene.fadeUnit === 'beats' ? scene.fadeIn : (scene.fadeIn * REFERENCE_BPM) / 60;
}

function bandProblem(scene: Scene): string | undefined {
  const band = TIER_BANDS[tierOf(scene)!];
  const inside = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
  for (const rule of scene.rules) {
    const move = rule.movementEffect;
    if (active(move)) {
      if (!inside(move.length, band.movementLength)) {
        return `movement length ${move.length} beats, wants ${band.movementLength.join('-')}`;
      }
      if (!inside(move.size, band.movementSize)) {
        return `movement size ${move.size} degrees, wants ${band.movementSize.join('-')}`;
      }
    }
    const pulse = rule.intensityEffect;
    if (active(pulse) && !inside(pulse.length, band.intensityLength)) {
      return `intensity length ${pulse.length} beats, wants ${band.intensityLength.join('-')}`;
    }
  }
  return undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function checkClimb(cx: Context): Omit<ItemResult, 'item' | 'title'> {
  const level = (s: Scene) => {
    const state = lookState(s);
    return Math.max(...PARTS.map((p) => state[p].intensity));
  };
  const typical = new Map<Tier, number>();
  for (const tier of TIERS) {
    const scenes = tierLooks(cx).filter((s) => tierOf(s) === tier);
    if (scenes.length > 0) typical.set(tier, median(scenes.map(level)));
  }
  const present = TIERS.filter((t) => typical.has(t));
  if (present.length < 2) return result(null, [], 'fewer than two tiers have Looks');
  const offenders: string[] = [];
  let worst: Score = 2;
  for (let i = 1; i < present.length; i++) {
    const [lower, upper] = [present[i - 1]!, present[i]!];
    const rise = typical.get(upper)! - typical.get(lower)!;
    if (rise < 0) worst = 0;
    else if (rise < MIN_TIER_CLIMB && worst > 1) worst = 1;
    if (rise < MIN_TIER_CLIMB) {
      offenders.push(
        `${upper}: typical level ${pct(typical.get(upper)!)} against ${pct(typical.get(lower)!)} in ${lower}`,
      );
    }
  }
  return result(worst, offenders);
}

function checkStacking(cx: Context): Omit<ItemResult, 'item' | 'title'> {
  const offenders: string[] = [];
  let tiers = 0;
  for (const tier of TIERS) {
    const scenes = dynamicScenes(cx).filter((s) => tierOf(s) === tier);
    if (scenes.length === 0) continue;
    tiers++;
    // The most dynamic Layers one cue can stack: each Layer holds one Scene,
    // so it adds the kinds of its busiest Scene.
    const byLayer = new Map<string, Scene[]>();
    for (const s of scenes) byLayer.set(s.layer, [...(byLayer.get(s.layer) ?? []), s]);
    let stack = 0;
    for (const list of byLayer.values()) stack += Math.max(...list.map(dynamicKinds), 1);
    const cap = TIER_BANDS[tier].maxDynamic;
    if (stack > cap) {
      offenders.push(
        `${tier}: up to ${stack} dynamic Effects can stack across ${byLayer.size} Layers (cap ${cap}), e.g. ${scenes[0]!.name}`,
      );
    }
  }
  return result(
    grade(offenders.length, tiers),
    offenders,
    tiers === 0 ? 'no tiered dynamic Scene' : undefined,
  );
}

/** The Hz a strobe or square Effect flashes at, with the Show's cap on a Go Scene. */
function strobeProblems(scene: Scene, cx: Context): string[] {
  const problems: string[] = [];
  const goFired = !cx.hits.has(scene.id);
  for (const rule of scene.rules) {
    if (rule.strobe !== undefined && rule.strobe !== 'Off' && goFired) {
      const raw = strobeHz(rule.strobe, REFERENCE_BPM);
      const hz = cx.show.strobeCap === undefined ? raw : Math.min(raw, cx.show.strobeCap);
      if (hz > STROBE_MAX_HZ) problems.push(`strobe ${round(hz)} Hz at ${REFERENCE_BPM} BPM`);
    }
    const pulse = rule.intensityEffect;
    if (active(pulse) && pulse.shape === 'Square' && goFired) {
      const hz = REFERENCE_BPM / 60 / pulse.length;
      if (hz > STROBE_MAX_HZ)
        problems.push(`square Effect ${round(hz)} Hz at ${REFERENCE_BPM} BPM`);
    }
  }
  return problems;
}

function checkStrobe(cx: Context): Omit<ItemResult, 'item' | 'title'> {
  const scenes = cx.show.scenes.filter((s) =>
    s.rules.some(
      (r) =>
        (r.strobe !== undefined && r.strobe !== 'Off') ||
        (active(r.intensityEffect) && r.intensityEffect.shape === 'Square'),
    ),
  );
  return sceneCheck(scenes, (s) => strobeProblems(s, cx)[0], 'no Scene strobes');
}

const isPale = (tone: Tone): boolean => tone.kind === 'pale';
const calm = (rule: Rule): boolean =>
  !hasDynamicEffect(rule) && !(rule.strobe && rule.strobe !== 'Off');

function checkBasics(cx: Context): Omit<ItemResult, 'item' | 'title'> {
  const offenders: string[] = [];
  let checks = 0;
  const base = cx.show.scenes.find((s) => s.id === cx.show.baseLook);
  checks++;
  if (base === undefined) offenders.push('Show: no Base Look');
  else if (!base.rules.every((r) => isPale(toneOf(r.colour)) && calm(r))) {
    offenders.push(`${base.name}: Base Look is not neutral and still`);
  }
  checks++;
  const dark = cx.show.scenes.find(
    (s) => DARK_NAME.test(s.name) && s.rules.every((r) => (r.intensity ?? 0) === 0),
  );
  if (dark === undefined) offenders.push('Show: no Dark Scene');
  const moving = (s: Scene) =>
    s.rules.some((r) => r.direction !== undefined || r.movementEffect !== undefined);
  for (const tier of TIERS) {
    const scenes = cx.show.scenes.filter((s) => tierOf(s) === tier && moving(s));
    if (scenes.length === 0) continue;
    checks++;
    const still = scenes.some(
      (s) => !s.rules.some((r) => active(r.movementEffect)) && !isDynamic(s),
    );
    if (!still) offenders.push(`${scenes[0]!.name}: no still Movement in ${tier}`);
  }
  return result(grade(offenders.length, checks), offenders);
}

function checkLookCount(cx: Context): Omit<ItemResult, 'item' | 'title'> {
  const offenders: string[] = [];
  let tiers = 0;
  for (const tier of TIERS) {
    const scenes = tierLooks(cx).filter((s) => tierOf(s) === tier);
    if (scenes.length === 0) continue;
    tiers++;
    if (scenes.length > MAX_LOOKS_PER_TIER) {
      offenders.push(
        `${scenes[0]!.name}: ${scenes.length} Looks in ${tier}, at most ${MAX_LOOKS_PER_TIER}`,
      );
    }
  }
  return result(grade(offenders.length, tiers), offenders, tiers === 0 ? needsTier : undefined);
}

// ---------------------------------------------------------------- the report

/** Scores a Show. */
export function lintShow(show: Show): LintReport {
  const flash = new Set<string>();
  const go = new Set<string>();
  for (const t of show.triggers) {
    if (t.mode === 'flash') flash.add(t.scene);
    if (t.mode === 'go') go.add(t.scene);
  }
  const cx: Context = { show, hits: new Set([...flash].filter((id) => !go.has(id))) };
  const items = ITEMS.map(({ item, title, check }) => ({ item, title, ...check(cx) }));
  const scoredItems = items.filter((i) => i.score !== null);
  return {
    items,
    total: scoredItems.reduce((sum, i) => sum + (i.score ?? 0), 0),
    max: scoredItems.length * 2,
    scored: scoredItems.length,
  };
}

/** Whether `--strict` fails the report: an item 3, 4 or 11 scored 0. */
export function failsStrict(report: LintReport): boolean {
  return report.items.some(
    (i) => (STRICT_ITEMS as readonly number[]).includes(i.item) && i.score === 0,
  );
}

/** The report as text: each item's score, its offending Scenes, and the total. */
export function formatReport(name: string, report: LintReport): string {
  const lines = [`Show lint: ${name}`];
  for (const i of report.items) {
    const score = i.score === null ? 'not scored' : `${i.score}/2`;
    lines.push(
      `${String(i.item).padStart(2)}. ${i.title}: ${score}${i.score === null && i.note ? ` (${i.note})` : ''}`,
    );
    for (const o of i.offenders.slice(0, 12)) lines.push(`      - ${o}`);
    if (i.offenders.length > 12) lines.push(`      - and ${i.offenders.length - 12} more`);
  }
  lines.push(
    `Total: ${report.total}/${report.max} (${report.scored} of ${report.items.length} items scored)`,
  );
  lines.push('Items 13-16 need a Plan or screenshots and are not linted here.');
  return lines.join('\n');
}

/** The command: lints a Show file. Returns the exit code. */
export function runLint(
  argv: string[],
  read: (path: string) => string,
): { text: string; code: number } {
  const files = argv.filter((a) => !a.startsWith('--'));
  const strict = argv.includes('--strict');
  const unknown = argv.filter((a) => a.startsWith('--') && a !== '--strict');
  if (files.length !== 1 || unknown.length > 0) {
    throw new Error('Usage: npm run show:lint -- <file.lcshow> [--strict]');
  }
  const report = lintShow(loadShowFile(read(files[0]!)));
  return { text: formatReport(files[0]!, report), code: strict && failsStrict(report) ? 1 : 0 };
}
