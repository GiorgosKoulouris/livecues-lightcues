import { describe, expect, it } from 'vitest';
import { parsePlan, PlanError } from './plan';

const fail = (text: string): PlanError => {
  try {
    parsePlan(text);
  } catch (e) {
    return e as PlanError;
  }
  throw new Error('did not throw');
};

describe('parsePlan', () => {
  it('reads every section', () => {
    const plan = parsePlan(`song: Lantern
show: shows/Energy.lcshow
brief:
  vibe: warm, slow
  avoid: [red]
palette:
  Chill:
    look: "Chill: Candle"
start:
  movement: release
cues:
  - at: Verse1
    tier: chill
    pulse: release
events:
  - at: 5.10
    scene: "Hit: Riser"
    length: 1 bar
  - at: 6
    release: hit
patterns:
  - in: Chorus1
    every: 1 bar
    scene: "Hit: Beam punch"
end: "Intro/Outro: Fade"
`);
    expect(plan.song).toBe('Lantern');
    expect(plan.brief).toEqual({ vibe: 'warm, slow', avoid: ['red'] });
    expect(plan.palette['chill']?.['look']?.value).toBe('Chill: Candle');
    expect(plan.start['movement']?.release).toBe(true);
    expect(plan.cues[0]).toMatchObject({ at: 'Verse1', tier: 'chill', line: 12 });
    // `5.10` stays bar 5 beat 10 and is not read as the number 5.1.
    expect(plan.events[0]?.at).toBe('5.10');
    expect(plan.events[1]?.releaseLayer?.value).toBe('hit');
    expect(plan.patterns[0]).toMatchObject({ in: 'Chorus1' });
    expect(plan.end?.['look']?.value).toBe('Intro/Outro: Fade');
  });

  it('names the line of each error', () => {
    expect(fail('song: A\nbogus: 1\n').message).toBe("Line 2: Unknown key 'bogus'");
    expect(fail('cues:\n  - tier: x\n').message).toBe("Line 2: A cue needs an 'at'");
    expect(fail('song: A\nevents:\n  - at: 1\n').message).toContain('Line 3:');
    expect(fail('song: A\nevents:\n  - at: 1\n    scene: X\n    bogus: 1\n').line).toBe(5);
    expect(fail('song: A\ncues: x\n').message).toBe('Line 2: cues must be a list');
    expect(fail('song: A\npatterns:\n  - every: 1 bar\n    scene: X\n').message).toContain(
      "'in' or 'from' and 'to'",
    );
  });

  it('needs a song and valid YAML', () => {
    expect(fail('show: x\n').message).toContain("needs a 'song'");
    expect(fail('song: [a\n').line).toBeDefined();
  });
});
