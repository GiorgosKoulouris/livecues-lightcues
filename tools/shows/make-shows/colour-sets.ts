// The Colour Set pool of a generated Show and each song's Set roles (Main,
// Break, Swap). See ADR 0023.
//
//   pool    `clamp(ceil(songs x 2/3), 6, 8)` sets. Main sets come in exchanged
//           pairs, so a Swap is another song's Main. Break sets lead with a
//           contrast hue: the complement of the first band colour, and the
//           mood's.
//   roles   `colourSets` hands every song a Main, a Break and a Swap.
import type { Swatch } from '../../../src/shared/colour';
import type { ColourSet } from '../../../src/shared/show';
import type { Brief } from './brief';
import {
  slugOf,
  ANALOGOUS_MAX_DEG,
  ANALOGOUS_MOODS,
  COLOUR_SET_FADE_S,
  COLOUR_SET_POOL,
  COMPLEMENTARY_MIN_DEG,
  DEFAULT_MOOD,
  hueGap,
  MAX_SONGS_PER_ROLE,
  MOOD_CONTRAST,
  MOOD_PRIMARIES,
  SWATCH_HUE,
} from './rules';

export interface SongSets {
  song: string;
  /** Colour Set ids. */
  main: string;
  break: string;
  swap: string;
}

export interface ColourSetPlan {
  sets: ColourSet[];
  songs: SongSets[];
  /** Things the Cue Sheet says: a repeated Main, for one. */
  notes: string[];
}

interface Triple {
  primary: Swatch;
  secondary: Swatch;
  accent: Swatch;
}

const hueOf = (swatch: Swatch): number | undefined => SWATCH_HUE[swatch];
const HUE_SWATCHES = (Object.keys(SWATCH_HUE) as Swatch[]).filter((s) => s !== 'UV');

/** The pool size for a song count. */
export const poolSize = (songs: number): number =>
  Math.min(COLOUR_SET_POOL.max, Math.max(COLOUR_SET_POOL.min, Math.ceil((songs * 2) / 3)));

/** The swatch whose hue gap from `primary` is nearest `target`, among those the `ok` test allows. */
function nearestGap(
  primary: Swatch,
  target: number,
  ok: (gap: number) => boolean,
): Swatch | undefined {
  const from = hueOf(primary);
  if (from === undefined) return undefined;
  const options = HUE_SWATCHES.filter((s) => s !== primary && ok(hueGap(from, hueOf(s)!)));
  options.sort(
    (a, b) =>
      Math.abs(hueGap(from, hueOf(a)!) - target) - Math.abs(hueGap(from, hueOf(b)!) - target),
  );
  return options[0];
}

/**
 * P2: a Secondary across the colour wheel (150 degrees or more) or next to the
 * primary. A primary with no neighbour inside 45 degrees (Green, Cyan) takes a
 * complementary one; a white primary takes Blue.
 */
export function secondaryFor(primary: Swatch, kind: 'complementary' | 'analogous'): Swatch {
  const across = () => nearestGap(primary, 180, (g) => g >= COMPLEMENTARY_MIN_DEG);
  const next = () => nearestGap(primary, 30, (g) => g > 0 && g <= ANALOGOUS_MAX_DEG);
  return (kind === 'analogous' ? (next() ?? across()) : across()) ?? 'Blue';
}

/** Whether two swatches make a P2 pair: complementary or analogous, not a near miss. */
export function goodPair(a: Swatch, b: Swatch): boolean {
  const [ha, hb] = [hueOf(a), hueOf(b)];
  if (ha === undefined || hb === undefined) return false;
  const gap = hueGap(ha, hb);
  return gap >= COMPLEMENTARY_MIN_DEG || (gap > 0 && gap <= ANALOGOUS_MAX_DEG);
}

/** P6: the band colours that have a hue, else the mood's primaries. */
export function bandHues(brief: Brief): Swatch[] {
  const own = brief.colours.filter((c) => hueOf(c) !== undefined);
  return own.length > 0 ? own : [...MOOD_PRIMARIES[brief.mood ?? DEFAULT_MOOD]];
}

/** The shades and neighbours of the band hues, within 45 degrees, nearest first. */
export function family(band: readonly Swatch[]): Swatch[] {
  const gapTo = (s: Swatch) => Math.min(...band.map((b) => hueGap(hueOf(b)!, hueOf(s)!)));
  return HUE_SWATCHES.filter((s) => !band.includes(s) && gapTo(s) <= ANALOGOUS_MAX_DEG).sort(
    (a, b) => gapTo(a) - gapTo(b),
  );
}

/** The two contrast hues: the complement of the first band colour, and the mood's. */
export function contrastHues(brief: Brief): [Swatch, Swatch] {
  const band = bandHues(brief);
  const first = secondaryFor(band[0]!, 'complementary');
  let second = MOOD_CONTRAST[brief.mood ?? DEFAULT_MOOD];
  if (second === first || band.includes(second)) {
    // The mood's contrast is already in use: take the hue farthest from the rest.
    const used = [...band, first];
    const gapTo = (s: Swatch) => Math.min(...used.map((u) => hueGap(hueOf(u)!, hueOf(s)!)));
    second = [...HUE_SWATCHES, 'UV' as Swatch]
      .filter((s) => !used.includes(s))
      .reduce((best, s) => (gapTo(s) > gapTo(best) ? s : best));
  }
  return [first, second];
}

const keyOf = (t: Triple) => `${t.primary}|${t.secondary}|${t.accent}`;
const exchanged = (t: Triple): Triple => ({ ...t, primary: t.secondary, secondary: t.primary });
const nameOf = (t: Triple) => `${t.primary} / ${t.secondary} / ${t.accent}`;
/** The Secondary a Primary takes: a band colour that pairs well, else the mood's kind of pair. */
function partnerFor(brief: Brief, primary: Swatch): Swatch {
  const kind = ANALOGOUS_MOODS.includes(brief.mood ?? DEFAULT_MOOD) ? 'analogous' : 'complementary';
  return (
    bandHues(brief).find((c) => c !== primary && goodPair(primary, c)) ??
    secondaryFor(primary, kind)
  );
}

/** The sets of the pool: Main sets first, then Break sets. */
function buildPool(brief: Brief, songs: number): { sets: Triple[]; contrast: Swatch[] } {
  const size = poolSize(songs);
  const band = bandHues(brief);
  const contrast = contrastHues(brief);
  const near = [...band, ...family(band)];
  const breaks = Math.min(Math.max(2, Math.ceil(songs / MAX_SONGS_PER_ROLE)), size - 2);
  const mains = size - breaks;

  // Break sets lead with a contrast hue, alternating between the two.
  const breakSets: Triple[] = [];
  const used = new Map<Swatch, number>();
  for (let i = 0; i < breaks; i++) {
    const hue = contrast[i % 2]!;
    const j = used.get(hue) ?? 0;
    used.set(hue, j + 1);
    const partners = near.filter((x) => x !== hue && goodPair(hue, x));
    const secondary =
      partners.length > 0 ? partners[j % partners.length]! : secondaryFor(hue, 'complementary');
    const accent: Swatch =
      j === 0 ? 'White' : j === 1 && band[0] !== secondary ? band[0]! : 'Warm White';
    breakSets.push({ primary: hue, secondary, accent });
  }

  // Main sets come in exchanged pairs, so each Swap is a Main of the pool.
  const mainSets: Triple[] = [];
  const has = (t: Triple) => [...mainSets, ...breakSets].some((x) => keyOf(x) === keyOf(t));
  const accents: Swatch[] = ['White', 'Warm White', 'Amber', 'Cyan'];
  for (const accent of accents) {
    for (const primary of near) {
      if (mainSets.length + 2 > mains) break;
      const main: Triple = { primary, secondary: partnerFor(brief, primary), accent };
      if (accent === main.primary || accent === main.secondary) continue;
      if (has(main) || has(exchanged(main))) continue;
      mainSets.push(main, exchanged(main));
    }
  }
  // An odd Main left over takes the exchange of a Break set, so it still has a Swap.
  for (const b of breakSets) {
    if (mainSets.length >= mains) break;
    if (!has(exchanged(b))) mainSets.push(exchanged(b));
  }
  // Still short (a narrow band): single Mains with another Accent.
  for (const accent of accents) {
    for (const primary of near) {
      if (mainSets.length >= mains) break;
      const main: Triple = { primary, secondary: partnerFor(brief, primary), accent };
      if (accent !== main.primary && accent !== main.secondary && !has(main)) mainSets.push(main);
    }
  }
  return { sets: [...mainSets, ...breakSets], contrast };
}

/**
 * The pool and each song's Main, Break and Swap. A song colour override is its
 * Main and its Swap (both added to the pool if they are not there). Break
 * always comes from the existing contrast-led sets, so a full pool never grows
 * a Break.
 */
export function colourSets(brief: Brief): ColourSetPlan {
  const size = poolSize(brief.songs.length);
  const { sets: pool, contrast } = buildPool(brief, brief.songs.length);
  const notes: string[] = [];
  const count = { main: new Map<number, number>(), break: new Map<number, number>() };
  const bump = (m: Map<number, number>, i: number) => m.set(i, (m.get(i) ?? 0) + 1);
  const used = (m: Map<number, number>, i: number) => m.get(i) ?? 0;
  const indexOf = (t: Triple) => pool.findIndex((x) => keyOf(x) === keyOf(t));
  const ensure = (t: Triple): number => {
    const found = indexOf(t);
    if (found >= 0) return found;
    pool.push(t);
    return pool.length - 1;
  };
  const isContrast = (i: number) => contrast.includes(pool[i]!.primary);

  const roles: { main: number; break: number; swap: number }[] = [];
  brief.songs.forEach((song, i) => {
    const previous = roles[i - 1]?.main;
    let main: number;
    if (song.colours !== undefined) {
      const [primary, given, accent] = song.colours;
      main = ensure({
        primary: primary!,
        secondary: given ?? partnerFor(brief, primary!),
        accent: accent ?? 'White',
      });
      if (main === previous) {
        notes.push(
          `${song.name} repeats the Main of ${brief.songs[i - 1]!.name} (its brief colours)`,
        );
      }
    } else {
      const swappable = (c: number) => indexOf(exchanged(pool[c]!)) >= 0;
      const order = pool
        .map((_, c) => c)
        .filter((c) => c !== previous)
        .sort(
          (a, b) =>
            Number(used(count.main, a) >= MAX_SONGS_PER_ROLE) -
              Number(used(count.main, b) >= MAX_SONGS_PER_ROLE) ||
            Number(!swappable(a)) - Number(!swappable(b)) ||
            Number(isContrast(a)) - Number(isContrast(b)) ||
            used(count.main, a) - used(count.main, b) ||
            a - b,
        );
      main = order[0]!;
    }
    bump(count.main, main);

    // Swap: the Main with Primary and Secondary exchanged.
    const flipped = exchanged(pool[main]!);
    let swap = indexOf(flipped);
    if (swap < 0 && (song.colours !== undefined || pool.length < size)) swap = ensure(flipped);
    if (swap < 0) {
      // The pool is full: the nearest set that leads with this Main's Secondary.
      const near = pool.findIndex((x, c) => c !== main && x.primary === pool[main]!.secondary);
      swap = near >= 0 ? near : pool.findIndex((_, c) => c !== main);
    }

    // Break: a contrast-led set, alternating between the two hues.
    const wanted = contrast[i % 2]!;
    const leads = pool
      .map((_, c) => c)
      .filter((c) => c !== main && c !== swap)
      .sort(
        (a, b) =>
          Number(!isContrast(a)) - Number(!isContrast(b)) ||
          Number(used(count.break, a) >= MAX_SONGS_PER_ROLE) -
            Number(used(count.break, b) >= MAX_SONGS_PER_ROLE) ||
          Number(pool[a]!.primary !== wanted) - Number(pool[b]!.primary !== wanted) ||
          used(count.break, a) - used(count.break, b) ||
          a - b,
      );
    const breakSet = leads[0]!;
    bump(count.break, breakSet);
    roles.push({ main, break: breakSet, swap });
  });

  // The first song's Main is the set that holds when the Show opens: put it first.
  const first = roles[0]?.main ?? 0;
  const order = [first, ...pool.map((_, c) => c).filter((c) => c !== first)];
  const ids = new Map<number, string>();
  const sets: ColourSet[] = order.map((c, n) => {
    const t = pool[c]!;
    const id = `set-${n + 1}-${slugOf(nameOf(t))}`;
    ids.set(c, id);
    return {
      id,
      name: nameOf(t),
      colours: {
        Primary: { swatch: t.primary },
        Secondary: { swatch: t.secondary },
        Accent: { swatch: t.accent },
      },
      fade: COLOUR_SET_FADE_S,
    };
  });
  const songs: SongSets[] = roles.map((r, i) => ({
    song: brief.songs[i]!.name,
    main: ids.get(r.main)!,
    break: ids.get(r.break)!,
    swap: ids.get(r.swap)!,
  }));
  return { sets, songs, notes };
}
