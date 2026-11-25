import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markedSong as song, project, SETS, useSongs } from './generate-fixture';
import type { Plan } from './plan';

const { generate, writeShow, folder } = useSongs();

/** The Colour Set cues of a Plan, as `bar role`. */
const setCues = (plan: Plan): string[] =>
  plan.cues.flatMap((cue) => {
    if (!cue.colourSet) return [];
    const role = Object.entries(SETS).find(([, name]) => name === cue.colourSet?.value)?.[0];
    return [`${cue.at} ${role}`];
  });

describe('lights:song generate: Colour Sets', () => {
  it('cues Main at bar 1, Break on a break, Main after it and Swap on the last chorus', () => {
    const { plan } = generate();
    // break1 and break2 are one Break; the solo before chorus3 brings Main back.
    expect(setCues(plan)).toEqual(['1 main', '65 break', '73 main', '77 swap']);
  });

  it('cues Main at bar 1 where the first section starts later', () => {
    const { plan } = generate({
      sections: [
        [9, 'verse1', 'groove'],
        [33, 'break', 'chill'],
        [45, 'verse2', 'groove'],
        [61, 'chorus', 'peak'],
      ],
    });
    expect(setCues(plan)).toEqual(['1 main', '33 break', '45 main', '61 swap']);
  });

  it('borrows a solo for the Break where no section is a break', () => {
    const { output, plan } = generate(
      song(48, [
        [1, 'intro', 'chill'],
        [9, 'verse', 'groove'],
        [17, 'solo', 'drive'],
        [25, 'verse2', 'groove'],
        [33, 'chorus', 'peak'],
        [41, 'outro', 'chill'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '17 break', '25 main', '33 swap']);
    expect(output).toContain('Colour Sets: Break borrows solo at bar 17');
  });

  it('else borrows the quietest section before the last chorus', () => {
    const { plan } = generate(
      song(48, [
        [1, 'intro', 'chill'],
        [9, 'verse', 'groove'],
        [17, 'pre', 'drive'],
        [25, 'chorus', 'drive'],
        [33, 'verse2', 'chill'],
        [37, 'chorus2', 'peak'],
        [45, 'outro', 'chill'],
      ]),
    );
    // verse2 runs into the Swap, so its Break brings one cue: verse brings two more.
    expect(setCues(plan)).toEqual(['1 main', '9 break', '17 main', '33 break', '37 swap']);
  });

  it('keeps to 6 cues, taking breakdowns and bridges first', () => {
    const { output, plan } = generate(
      song(72, [
        [1, 'intro', 'chill'],
        [9, 'break', 'chill'],
        [17, 'verse', 'groove'],
        [25, 'bridge', 'groove'],
        [33, 'verse2', 'groove'],
        [41, 'breakdown'],
        [49, 'verse3', 'groove'],
        [57, 'chorus', 'peak'],
        [65, 'outro', 'chill'],
      ]),
    );
    expect(setCues(plan)).toEqual([
      '1 main',
      '25 break',
      '33 main',
      '41 break',
      '49 main',
      '57 swap',
    ]);
    expect(output).toContain(
      'Colour Sets: break at bar 9 keeps the set held there, 6 cues at most',
    );
  });

  it('cues on 8-bar boundaries where the sections are too few', () => {
    const { plan } = generate(
      song(48, [
        [1, 'verse', 'groove'],
        [33, 'chorus', 'drive'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '17 break', '25 main', '33 swap']);
  });

  it('starts again on 8-bar boundaries where a borrowed section leaves too few', () => {
    const { output, plan } = generate(
      song(40, [
        [1, 'verse', 'drive'],
        [17, 'verse2', 'drive'],
        [29, 'chorus', 'peak'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '17 break', '25 main', '29 swap']);
    expect(output.match(/Break borrows/g)).toHaveLength(1);
  });

  it('borrows another section where the quietest leaves it short', () => {
    const { plan } = generate(
      song(46, [
        [1, 'verse', 'chill'],
        [9, 'chorus', 'peak'],
        [15, 'verse2', 'chill'],
        [23, 'chorus2', 'peak'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '9 break', '15 main', '23 swap']);
  });

  it('swaps late in a song that is one chorus', () => {
    const { plan } = generate(song(32, [[1, 'chorus', 'peak']]));
    expect(setCues(plan)).toEqual(['1 main', '9 break', '17 main', '25 swap']);
  });

  it('swaps the loudest section where there is no chorus', () => {
    const { output, plan } = generate(
      song(40, [
        [1, 'verse', 'groove'],
        [9, 'bridge', 'chill'],
        [17, 'verse2', 'groove'],
        [25, 'solo', 'peak'],
        [33, 'outro', 'chill'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '9 break', '17 main', '25 swap']);
    expect(output).toContain('Colour Sets: no chorus, so Swap takes solo at bar 25');
  });

  it('says when a song has too few bars for 4 cues', () => {
    const { output, plan } = generate(song(8, [[1, 'verse', 'groove']]));
    expect(setCues(plan)).toEqual(['1 main']);
    expect(output).toContain('Warning: Only 1 Colour Set cue: too few bars before the Swap for 4');
  });

  it('refuses a song with no Song sets row, naming the ones there are', () => {
    expect(() => generate({ ...song(8, [[1, 'verse', 'groove']]), region: 'Song' })).not.toThrow();
    const rpp = project(120, 8, [[1, 'verse', 'groove']]).replaceAll(' Song 1 ', ' Other 1 ');
    expect(() => generate({ rpp, region: 'Other', sections: [[1, 'verse', 'groove']] })).toThrow(
      /No Song sets row for 'Other'.*Lantern, Moonrise, Song/,
    );
  });

  it('refuses a Show with no Song sets table beside it', () => {
    const show = writeShow('bare');
    rmSync(join(folder(), 'bare cue sheet.md'));
    expect(() => generate({ show })).toThrow(/No Song sets table.*bare cue sheet\.md/);
  });

  it('refuses a row naming a Colour Set the Show does not have', () => {
    const show = writeShow('stale', (raw) => {
      raw.colourSets = raw.colourSets?.slice(0, 1);
    });
    expect(() => generate({ show })).toThrow(/Colour Set '.*' is not in the Show/);
  });

  it('refuses a Show without Colour Sets', () => {
    const show = writeShow('plain', (raw) => {
      raw.colourSets = [];
    });
    expect(() => generate({ show })).toThrow(/Colour Set '.*' is not in the Show/);
  });

  it('swaps on the last drop where there is no chorus, and leaves its tier', () => {
    const { plan, report } = generate(
      song(40, [
        [1, 'verse', 'groove'],
        [9, 'bridge', 'chill'],
        [17, 'verse2', 'groove'],
        [25, 'drop', 'drive'],
        [33, 'outro', 'peak'],
      ]),
    );
    expect(setCues(plan)).toEqual(['1 main', '9 break', '17 main', '25 swap']);
    expect(report.sections[3]?.tier).toBe('drive');
  });
});
