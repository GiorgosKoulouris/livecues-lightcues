import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadVenueFile } from '../../src/engine/venue-file';
import {
  BriefError,
  DEFAULT_RIG,
  loadBrief,
  parseBrief,
  summariseVenue,
  venueCount,
} from './brief';
import { FRONT_ROWS } from './rules';

const sample = new URL('./fixtures/sample-brief.yaml', import.meta.url);
const sampleVenue = new URL('./fixtures/sample-venue.lcvenue', import.meta.url);

const base = 'band: X\nsongs:\n  - name: A\n    bpm: 120\n';

/** The error thrown by parsing `text`, as a message. */
function failure(text: string): string {
  try {
    parseBrief(text);
  } catch (error) {
    expect(error).toBeInstanceOf(BriefError);
    return (error as Error).message;
  }
  throw new Error('expected parseBrief to throw');
}

describe('parseBrief', () => {
  it('parses the sample brief', () => {
    const brief = parseBrief(readFileSync(sample, 'utf8'));
    expect(brief).toMatchObject({
      band: 'Neon Harbour',
      genre: 'indie rock',
      mood: 'upbeat',
      colours: ['Amber', 'Blue'],
      venue: 'sample-venue.lcvenue',
      strobeHz: 4,
    });
    expect(brief.songs.map((s) => [s.name, s.bpm, s.plan, s.colours])).toEqual([
      ['Opener', 128, undefined, undefined],
      ['Slow Tide', 96, undefined, ['Blue', 'Lavender', 'White']],
      ['Last Train', 154, 'plans/last-train.yaml', undefined],
    ]);
  });

  it('defaults strobe to the cap and colours to none', () => {
    expect(parseBrief(base)).toMatchObject({ strobeHz: 4, colours: [] });
  });

  it('reads a strobe rate', () => {
    expect(parseBrief(`${base}strobe: 8.5\n`)).toMatchObject({ strobeHz: 8.5 });
  });

  it('reads swatch names without regard to case', () => {
    expect(parseBrief(`${base}colours: [warm white, amber]\n`).colours).toEqual([
      'Warm White',
      'Amber',
    ]);
  });

  it.each([
    ['not a mapping', '- a\n', 'Line 1: The brief must be a mapping'],
    ['bad YAML', 'band: [X\n', 'Line 2:'],
    ['unknown key', `${base}tempo: 3\n`, "Line 5: Unknown key 'tempo'"],
    ['empty band', 'band:\nsongs:\n  - name: A\n    bpm: 120\n', 'Line 1: band must be'],
    ['missing band', 'songs:\n  - name: A\n    bpm: 120\n', "Line 1: The brief needs a 'band'"],
    ['missing songs', 'band: X\n', "Line 1: The brief needs 'songs'"],
    ['empty songs', 'band: X\nsongs: []\n', 'Line 2: songs must be a list'],
    ['song not a mapping', 'band: X\nsongs:\n  - A\n', 'Line 3: Each song must be a mapping'],
    ['unknown mood', `${base}mood: sad\n`, 'Line 5: mood must be upbeat, melancholy'],
    ['unknown colour', `${base}colours: [Amber, Puce]\n`, "Line 5: colours: 'puce' is not one of"],
    ['empty colours', `${base}colours: []\n`, 'Line 5: colours must have 1 to'],
    ['front, which is gone', `${base}front: pale\n`, "Line 5: 'front' is gone"],
    ['bad strobe word', `${base}strobe: wild\n`, "Line 5: strobe must be 'capped' or a rate"],
    ['zero strobe', `${base}strobe: 0\n`, 'Line 5: strobe must be'],
    ['huge strobe', `${base}strobe: 99\n`, 'Line 5: strobe must be'],
    ['song without name', 'band: X\nsongs:\n  - bpm: 120\n', "Line 3: A song needs a 'name'"],
    ['song without bpm', 'band: X\nsongs:\n  - name: A\n', "Line 3: Song 'A' needs a 'bpm'"],
    ['bpm too low', 'band: X\nsongs:\n  - name: A\n    bpm: 89\n', 'Line 4: bpm must be a number'],
    [
      'bpm too high',
      'band: X\nsongs:\n  - name: A\n    bpm: 201\n',
      'Line 4: bpm must be a number',
    ],
    ['bpm not a number', 'band: X\nsongs:\n  - name: A\n    bpm: fast\n', 'Line 4: bpm must be'],
    [
      'unknown song key',
      'band: X\nsongs:\n  - name: A\n    bpm: 120\n    key: C\n',
      "Line 5: Unknown key 'key'",
    ],
    [
      'song colours too long',
      'band: X\nsongs:\n  - name: A\n    bpm: 120\n    colours: [Red, Blue, White, Pink]\n',
      'Line 5: colours must have 1 to 3',
    ],
    [
      'song colour unknown',
      'band: X\nsongs:\n  - name: A\n    bpm: 120\n    colours: [Red, Puce]\n',
      "Line 5: colours: 'puce'",
    ],
    [
      'a coloured song Accent',
      'band: X\nsongs:\n  - name: A\n    bpm: 120\n    colours: [Red, Blue, Amber]\n',
      "Line 5: colours: the Accent 'Amber' must be White or Warm White",
    ],
    ['duplicate song', `${base}  - name: a\n    bpm: 100\n`, "Line 5: Song 'a' is listed twice"],
    ['empty venue', `${base}venue:\n`, 'Line 5: venue must be'],
  ])('rejects %s with its line', (_name, text, message) => {
    expect(failure(text)).toContain(message);
  });
});

describe('song Accent', () => {
  const song = (colours: string) =>
    `band: X\nsongs:\n  - name: A\n    bpm: 120\n    colours: ${colours}\n`;

  it('takes White or Warm White as the third colour, and any colour as the first two', () => {
    expect(parseBrief(song('[Red, Blue, White]')).songs[0]!.colours).toEqual([
      'Red',
      'Blue',
      'White',
    ]);
    expect(parseBrief(song('[Amber, Blue, warm white]')).songs[0]!.colours![2]).toBe('Warm White');
  });
});

describe('summariseVenue', () => {
  const patch = loadVenueFile(readFileSync(sampleVenue, 'utf8'));

  it('counts Roles, movers and moving front washes in the fixture venue', () => {
    const venue = summariseVenue(patch);
    expect(venue.source).toBe('venue');
    expect(venue.roles).toEqual(['Wash', 'Spot/Beam']);
    expect(venue.roleCounts).toEqual({
      Wash: 12,
      'Spot/Beam': 2,
      Blinder: 0,
      Strobe: 0,
      'Pixel/Bar': 0,
      Effect: 0,
    });
    expect(venue.fixtures).toBe(14);
    expect(venue.movers).toBe(4);
    expect(venue.movingFrontWashes).toBe(2);
  });

  it('counts per Zone', () => {
    const venue = summariseVenue(patch);
    expect(venueCount(venue, { row: 'Front' })).toBe(6);
    expect(venueCount(venue, { rows: FRONT_ROWS, role: 'Wash' })).toBe(6);
    expect(venueCount(venue, { row: 'Upstage', role: 'Spot/Beam' })).toBe(2);
    expect(venueCount(venue, { row: 'Upstage', role: 'Wash' })).toBe(4);
    expect(venueCount(venue, { level: 'Floor' })).toBe(2);
    expect(venueCount(venue, { row: 'Midstage', level: 'Floor', column: 'Stage Right' })).toBe(1);
    expect(venueCount(venue)).toBe(14);
  });

  it('does not count a moving wash behind the front as a front wash', () => {
    const moved = structuredClone(patch);
    for (const f of moved.fixtures) if (f.id.startsWith('front-mover')) f.y = 5;
    expect(summariseVenue(moved).movingFrontWashes).toBe(0);
    expect(summariseVenue(moved).movers).toBe(4);
  });

  it('counts a moving front wash only in the Front part: wash Roles, front rows, Overhead', () => {
    const moved = (change: (f: (typeof patch.fixtures)[number]) => void) => {
      const copy = structuredClone(patch);
      for (const f of copy.fixtures) if (f.id.startsWith('front-mover')) change(f);
      return summariseVenue(copy);
    };
    // On the floor, a front-row mover is not Overhead light.
    expect(moved((f) => (f.height = 0.3)).movingFrontWashes).toBe(0);
    // A Pixel/Bar is a wash Role.
    expect(moved((f) => (f.role = 'Pixel/Bar')).movingFrontWashes).toBe(2);
    // A Spot/Beam is not.
    expect(moved((f) => (f.role = 'Spot/Beam')).movingFrontWashes).toBe(0);
    // Downstage counts as front.
    expect(moved((f) => (f.y = 0.5)).movingFrontWashes).toBe(2);
  });

  it('gives the default rig without a venue', () => {
    const venue = summariseVenue();
    expect(venue).toBe(DEFAULT_RIG);
    expect(venue.source).toBe('default');
    expect(venue.roles).toEqual(['Wash', 'Spot/Beam']);
    expect(venue.movers).toBe(0);
    expect(venue.movingFrontWashes).toBe(0);
    expect(venueCount(venue, { row: 'Front' })).toBeGreaterThan(0);
    expect(venueCount(venue, { row: 'Upstage' })).toBeGreaterThan(0);
    expect(venueCount(venue, { level: 'Floor' })).toBeGreaterThan(0);
  });
});

describe('loadBrief', () => {
  it('reads the sample brief and its venue beside it', () => {
    const { brief, venue, dir } = loadBrief(fileURLToPath(sample));
    expect(brief.band).toBe('Neon Harbour');
    expect(venue.source).toBe('venue');
    expect(venue.movingFrontWashes).toBe(2);
    expect(dir).toBe(fileURLToPath(new URL('./fixtures', import.meta.url)));
  });

  it('gives the default rig for a brief with no venue', () => {
    const folder = mkdtempSync(join(tmpdir(), 'lightcues-brief-'));
    try {
      writeFileSync(join(folder, 'brief.yaml'), base);
      expect(loadBrief(join(folder, 'brief.yaml')).venue).toBe(DEFAULT_RIG);
      writeFileSync(join(folder, 'brief.yaml'), `${base}venue: missing.lcvenue\n`);
      expect(() => loadBrief(join(folder, 'brief.yaml'))).toThrow(/^Line 5: venue 'missing/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('git ignore', () => {
  it('ignores bands/', () => {
    const out = execFileSync('git', ['check-ignore', 'bands/Neon/brief.yaml'], {
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('bands/Neon/brief.yaml');
  });
});
