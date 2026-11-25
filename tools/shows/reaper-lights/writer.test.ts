import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './cli';
import { readProject } from './rpp';
import {
  buildItem,
  detectEol,
  hashFileFor,
  outputFor,
  spliceItem,
  writeLights,
  PPQ,
} from './writer';
import type { MidiEvent } from './compile';

const fixture = readFileSync(new URL('./fixtures/lantern.rpp', import.meta.url), 'utf8');
const region = { index: 1, name: 'Lantern', start: 32, end: 185.6 };

const ev = (time: number, note: number, duration = 0.125): MidiEvent => ({
  time,
  duration,
  at: { bar: 1, beat: 1 },
  channel: 1,
  note,
  velocity: 100,
  kind: 'go',
  layer: 'look',
});
const events = [ev(0, 12), ev(2, 24), ev(2, 25, 1)];

const SHOW = {
  layers: [{ id: 'look', name: 'Look' }],
  scenes: [
    { id: 'a', name: 'Base: warm', layer: 'look' },
    { id: 'b', name: 'Intro/Outro: Fade', layer: 'look' },
  ],
  baseLook: 'a',
  triggers: [
    { channel: 1, note: 0, scene: 'a', mode: 'release' },
    { channel: 1, note: 12, scene: 'a', mode: 'go' },
    { channel: 1, note: 15, scene: 'b', mode: 'go' },
  ],
};
const PLAN = 'song: Lantern\nshow: show.json\n';

describe('buildItem', () => {
  const project = readProject(fixture);
  const item = buildItem(project, region, events, '    ');

  it('names and spans the item', () => {
    expect(item.text).toContain('NAME "lights:Lantern"');
    expect(item.text).toContain('POSITION 32');
    expect(item.text).toContain('LENGTH 153.6');
    expect(item.text).toContain(`HASDATA 1 ${PPQ} QN`);
  });

  it('puts notes on beat ticks at 150 BPM (1 s = 2.5 beats)', () => {
    // 2 s = 5 beats = 4800 ticks; offs sort before ons at one tick.
    expect(item.text).toContain('E 0 90 0c 64');
    expect(item.text).toContain('E 300 80 0c 00');
    expect(item.text).toContain('E 4500 90 18 64');
  });
});

describe('spliceItem', () => {
  it('inserts at the end of the MidiToLights track and leaves the rest identical', () => {
    const out = spliceItem(fixture, region, events, undefined, false);
    expect(out.replaced).toBe(false);
    const track = readProject(out.raw).tracks.find((t) => t.name === 'MidiToLights');
    expect(track?.items.map((i) => i.name)).toEqual(['lights:Lantern']);
    const at = fixture.indexOf('  <TRACK {00000000-0000-4000-8000-000000000007}');
    const tail = fixture.indexOf('  >\n>', at);
    expect(out.raw.slice(0, tail)).toBe(fixture.slice(0, tail));
    expect(out.raw.endsWith('  >\n>\n')).toBe(true);
  });

  it('round trips: replacing with the same events changes nothing, and other items stay', () => {
    const first = spliceItem(fixture, region, events, undefined, false);
    const again = spliceItem(first.raw, region, events, first.hash, false);
    expect(again.replaced).toBe(true);
    expect(again.raw).toBe(first.raw);
    const other = [ev(0, 12), ev(4, 30)];
    const next = spliceItem(first.raw, region, other, first.hash, false);
    const itemStart = first.raw.indexOf(
      '    <ITEM\n      POSITION 32\n      SNAPOFFS 0\n      LENGTH 153.6',
    );
    expect(next.raw.slice(0, itemStart)).toBe(first.raw.slice(0, itemStart));
    expect(next.raw.endsWith('    >\n  >\n>\n')).toBe(true);
    expect(next.raw).not.toBe(first.raw);
  });

  it('refuses when the item was hand-edited, unless forced', () => {
    const first = spliceItem(fixture, region, events, undefined, false);
    const edited = first.raw.replace('E 0 90 0c 64', 'E 0 90 0d 64');
    expect(() => spliceItem(edited, region, events, first.hash, false)).toThrow(/edited/);
    expect(spliceItem(edited, region, events, first.hash, true).raw).toBe(first.raw);
  });

  it('is not fooled by Reaper re-chopping the same notes', () => {
    const first = spliceItem(fixture, region, events, undefined, false);
    // Note-on written as velocity-0 off and a selected `e` line do not change the notes.
    const rewritten = first.raw.replace('E 0 90 0c 64', 'e 0 90 0c 64');
    expect(spliceItem(rewritten, region, events, first.hash, false).raw).toBe(first.raw);
  });

  it('refuses an existing item with no recorded hash', () => {
    const first = spliceItem(fixture, region, events, undefined, false);
    const other = [ev(0, 12), ev(4, 30)];
    expect(() => spliceItem(first.raw, region, other, undefined, false)).toThrow(/no hash/);
  });

  it('accepts an item that already holds the new MIDI, whatever the hash file says', () => {
    // A crash after the rename but before the hash write leaves the old hash.
    const first = spliceItem(fixture, region, events, undefined, false);
    const again = spliceItem(first.raw, region, events, 'stale', false);
    expect(again.raw).toBe(first.raw);
  });

  it('refuses a project with no MidiToLights track', () => {
    const raw = fixture.replace('NAME MidiToLights', 'NAME Other');
    expect(() => spliceItem(raw, region, events, undefined, false)).toThrow(/MidiToLights/);
  });

  it('keeps CRLF, and refuses mixed line endings', () => {
    const crlf = fixture.replaceAll('\n', '\r\n');
    const out = spliceItem(crlf, region, events, undefined, false);
    expect(out.raw.replaceAll('\r\n', '')).not.toContain('\n');
    expect(out.raw.slice(0, crlf.indexOf('  <TRACK {00000000-0000-4000-8000-000000000007}'))).toBe(
      crlf.slice(0, crlf.indexOf('  <TRACK {00000000-0000-4000-8000-000000000007}')),
    );
    expect(() => detectEol(`a\r\nb\n`)).toThrow(/mixes CRLF/);
    expect(() => spliceItem(crlf.replace('\r\n', '\n'), region, events, undefined, false)).toThrow(
      /mixes/,
    );
  });
});

describe('writeLights', () => {
  let dir: string;
  let rpp: string;
  let plan: string;
  let out: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lights-writer-'));
    rpp = join(dir, 'Project.rpp');
    out = join(dir, 'Project.lights.rpp');
    plan = join(dir, 'Lantern.lights.yaml');
    writeFileSync(rpp, fixture);
    writeFileSync(plan, PLAN);
    writeFileSync(join(dir, 'show.json'), JSON.stringify(SHOW));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('names the copy next to the project', () => {
    expect(outputFor('/a/b/Set.rpp')).toBe(join('/a/b', 'Set.lights.rpp'));
  });

  it('writes the item to <name>.lights.rpp and leaves the original and no extras', () => {
    const r = writeLights({ rpp, plan });
    expect(r.replaced).toBe(false);
    expect(r.output).toBe(out);
    expect(readFileSync(rpp, 'utf8')).toBe(fixture);
    expect(readFileSync(out, 'utf8')).toContain('NAME "lights:Lantern"');
    expect(readFileSync(hashFileFor(plan, 'Lantern'), 'utf8')).toMatch(/^[0-9a-f]{64}\n$/);
    expect(readdirSync(dir).sort()).toEqual([
      'Lantern.lights.hash',
      'Lantern.lights.yaml',
      'Project.lights.rpp',
      'Project.rpp',
      'show.json',
    ]);
  });

  it('rewrites the existing copy, then stops on a hand edit until forced', () => {
    writeLights({ rpp, plan });
    expect(writeLights({ rpp, plan }).replaced).toBe(true);
    const edited = readFileSync(out, 'utf8').replace(/E 0 90 0c 64/, 'E 0 90 0d 64');
    writeFileSync(out, edited);
    expect(() => writeLights({ rpp, plan })).toThrow(/edited/);
    expect(readFileSync(out, 'utf8')).toBe(edited);
    writeLights({ rpp, plan, force: true });
    expect(readFileSync(out, 'utf8')).not.toBe(edited);
    expect(readFileSync(rpp, 'utf8')).toBe(fixture);
  });

  it('starts from the existing copy, so other regions items survive', () => {
    writeLights({ rpp, plan });
    const other = readFileSync(out, 'utf8').replaceAll('lights:Lantern', 'lights:Other');
    writeFileSync(out, other);
    writeLights({ rpp, plan });
    const raw = readFileSync(out, 'utf8');
    expect(raw).toContain('NAME "lights:Other"');
    expect(raw).toContain('NAME "lights:Lantern"');
  });

  it('runs through the command line', () => {
    const text = run(['write', rpp, plan, '--force']);
    expect(text).toContain('Inserted lights:Lantern on MidiToLights');
    expect(text).toContain(`Wrote: ${out}`);
    expect(() => run(['write'])).toThrow(/Usage/);
  });
});
