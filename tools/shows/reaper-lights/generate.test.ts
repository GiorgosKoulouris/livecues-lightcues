import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Tier } from '../make-shows/rules';
import { run } from './cli';
import { EFFECTS, offBand, LANTERN, LANTERN_SECTIONS, useSongs } from './generate-fixture';
import { tierTag } from './show';

const { generate, writeShow, folder } = useSongs();

describe('lights:song generate', () => {
  it('writes a Plan beside the others that scores 2 on Look and Effect Density', () => {
    const { output, planPath, report } = generate();
    expect(output).toContain(`Wrote: ${planPath}`);
    expect(report.sections).toHaveLength(11);
    expect(offBand(report, EFFECTS)).toEqual([]);
  });

  it('lights each section from its own tier', () => {
    const { report } = generate();
    expect(report.sections.map((s) => s.tier)).toEqual(
      LANTERN_SECTIONS.slice(1).map(([, , tier]) => tier),
    );
  });

  it('gives the same Plan for the same inputs', () => {
    const first = generate().text;
    expect(generate({ flags: ['--force'] }).text).toBe(first);
  });

  it('picks otherwise for another song', () => {
    const first = generate().plan.cues.map((c) => c.picks);
    const other = generate({
      rpp: LANTERN.replace(' Lantern 1 ', ' Moonrise 1 '),
      region: 'Moonrise',
    });
    expect(other.plan.cues.map((c) => c.picks)).not.toEqual(first);
  });

  it('refuses to overwrite a Plan without --force', () => {
    const { planPath } = generate();
    writeFileSync(planPath, 'song: Lantern\n');
    expect(() => generate()).toThrow(/already exists.*--force/);
    expect(readFileSync(planPath, 'utf8')).toBe('song: Lantern\n');
    expect(generate({ flags: ['--force'] }).plan.cues.length).toBeGreaterThan(0);
  });

  it('never stacks past a cap', () => {
    expect(generate().stacking).toEqual([]);
  });

  it('never repeats the previous Scene when it swaps a Layer', () => {
    const { plan } = generate();
    const last = new Map<string, string>();
    let held: string | undefined;
    for (const cue of plan.cues) {
      for (const [layer, pick] of Object.entries(cue.picks)) {
        if (pick.release) continue;
        // A Colour FX re-fired beside a new Look keeps running; it is no swap.
        const refire = layer === 'colourfx' && cue.picks.look && pick.value === held;
        if (!refire) expect(pick.value, `bar ${cue.at} ${layer}`).not.toBe(last.get(layer));
        last.set(layer, pick.value);
      }
      const cfx = cue.picks.colourfx;
      if (cfx) held = cfx.release ? undefined : cfx.value;
    }
  });

  it('re-fires the running Colour FX in every cue that fires a Look', () => {
    // A second Look at bar 9 of a section lands on a Colour FX that runs on.
    const { plan } = generate({
      sections: [
        [1, 'verse', 'groove'],
        [25, 'chorus', 'drive'],
      ],
    });
    let held = false;
    let refired = 0;
    for (const cue of plan.cues) {
      const cfx = cue.picks.colourfx;
      if (cue.picks.look && held) {
        expect(cfx, `bar ${cue.at}`).toBeDefined();
        refired++;
      }
      if (cfx) held = !cfx.release;
    }
    expect(refired).toBeGreaterThan(0);
  });

  it('keeps swaps on phrase boundaries: Looks on bar 1, 9 or 17, Effects every 4th bar', () => {
    const { plan } = generate();
    const starts = LANTERN_SECTIONS.map(([bar]) => bar);
    for (const cue of plan.cues) {
      const bar = Number(cue.at);
      const offset = bar - Math.max(...starts.filter((s) => s <= bar));
      expect(offset % 4, `bar ${cue.at}`).toBe(0);
      if (cue.picks.look) expect(offset % 8, `Look at bar ${cue.at}`).toBe(0);
    }
  });

  it('scores 2 in sections of every length and tier', () => {
    const rpp = LANTERN.replace(/^ {2}MARKER \d+ [\d.]+ \S+ 0 0 .*\n/gm, '');
    const lengths = [1, 2, 3, 4, 6, 8, 9, 12, 15, 16, 23, 24, 33, 40];
    for (const tier of ['chill', 'groove', 'drive', 'peak'] as const) {
      for (const length of lengths) {
        const sections: [number, string, Tier?][] = [
          [1, 'verse', tier],
          [1 + length, 'chorus', tier],
        ];
        // A marker at each section, in a 96-bar region at 150 BPM.
        const markers = sections
          .map(
            ([bar, label], i) =>
              `  MARKER ${i + 1} ${32 + (bar - 1) * 1.6} ${label} 0 0 1 R {X} 0 2\n`,
          )
          .join('');
        const marked = rpp.replace('  <TRACK', `${markers}  <TRACK`);
        const { report, stacking } = generate({ rpp: marked, sections, flags: ['--force'] });
        expect(offBand(report, EFFECTS), `${tier} ${length} bars`).toEqual([]);
        expect(stacking, `${tier} ${length} bars`).toEqual([]);
      }
    }
  });

  it('holds a stop dark, with no Effect running', () => {
    const { plan } = generate({
      sections: [
        [1, 'chorus', 'peak'],
        [9, 'stop'],
        [10, 'chorus', 'peak'],
      ],
    });
    const stop = plan.cues.find((c) => c.at === '9')!;
    expect(stop.picks.look?.value).toBe('Dark');
    for (const layer of ['movement', 'pulse', 'colourfx']) {
      expect(stop.picks[layer]?.release ?? true, layer).toBe(true);
    }
  });

  it('ends on the Base Look with every Effect released', () => {
    const { events, timeline, map } = generate();
    const last = timeline.end - timeline.start - 0.2;
    const end = events.filter((e) => e.time > last);
    expect(end.find((e) => e.layer === 'look')?.scene).toBe(map.baseLook!.name);
    expect(end.filter((e) => e.kind === 'release').map((e) => e.layer)).toEqual([
      'movement',
      'pulse',
      'colourfx',
    ]);
  });

  it('writes a Plan that render and write take unchanged', () => {
    const { project, planPath } = generate();
    expect(run(['render', project, planPath])).toContain('Wrote:');
    const written = run(['write', project, planPath]);
    expect(written).toContain('lights:Lantern');
    expect(written).not.toContain('dynamic Layers');
    expect(existsSync(join(folder(), 'song.lights.rpp'))).toBe(true);
  });

  it('says which section has no project marker, and which marker has no section', () => {
    const { output } = generate({
      sections: [
        [1, 'intro', 'chill'],
        [9, 'verse1', 'groove'],
      ],
    });
    expect(output).toContain(
      'Warning: Bar 1: no project marker for intro, so render does not score it as a section',
    );
    expect(output).toContain('Warning: Bar 25: marker Pre1 has no section in the sections file');
    expect(output).not.toContain('marker Verse1');
  });

  it('refuses an untagged Show', () => {
    const untagged = writeShow('untagged', (raw) => {
      for (const scene of raw.scenes) delete scene.tags;
    });
    expect(() => generate({ show: untagged })).toThrow(/untagged.*generate needs/i);
    expect(existsSync(join(folder(), 'Lights'))).toBe(false);
  });

  it('names a tier the Show has no Look for', () => {
    const show = writeShow('no-peak', (raw) => {
      raw.scenes = raw.scenes.filter(
        (s) => !(s.tags?.includes('look') && tierTag(s.tags ?? []) === 'peak'),
      );
    });
    expect(() => generate({ show })).toThrow(/no Peak Look/);
  });

  it('names the line of a section past the end of the song', () => {
    expect(() =>
      generate({
        sections: [
          [1, 'verse', 'groove'],
          [97, 'chorus', 'drive'],
        ],
      }),
    ).toThrow('Sections file: Line 3: bar 97 is past the end of the song (96 bars)');
  });

  it('names the sections file in its errors', () => {
    expect(() => generate({ sections: [[1, 'verse']] })).toThrow(
      "Sections file: Line 2: Section 'verse' needs a 'tier'",
    );
  });

  it('prints the usage without a Show or a sections file', () => {
    expect(() => run(['generate', 'song.rpp', 'Lantern', '--show', 'band.lcshow'])).toThrow(
      /Usage:/,
    );
    expect(() => run(['generate', 'song.rpp', '--show', 'band.lcshow', '--sections', 'x'])).toThrow(
      /Usage:/,
    );
    expect(() => run(['generate', 'song.rpp', 'Lantern', '--nope'])).toThrow(/Usage:/);
  });
});
