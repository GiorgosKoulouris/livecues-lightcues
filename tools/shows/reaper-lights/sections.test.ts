import { describe, expect, it } from 'vitest';
import { parseSections } from './sections';

describe('parseSections', () => {
  it('reads the bar, label and tier of each section', () => {
    const sections = parseSections(`# confirmed with the band
sections:
  - { bar: 1, label: intro, tier: chill }
  - { bar: 9, label: Verse1, tier: Groove }
  - { bar: 28, label: stop }
`);
    expect(sections).toEqual([
      { line: 3, bar: 1, label: 'intro', kind: 'intro', tier: 'chill' },
      { line: 4, bar: 9, label: 'Verse1', kind: 'verse', tier: 'groove' },
      { line: 5, bar: 28, label: 'stop', kind: 'stop' },
    ]);
  });

  it('takes a breakdown with no tier as Peak, and keeps a tier given for it', () => {
    const sections = parseSections(`sections:
  - { bar: 1, label: breakdown }
  - { bar: 9, label: breakdown2, tier: drive }
`);
    expect(sections.map((s) => s.tier)).toEqual(['peak', 'drive']);
  });

  const bad = (rows: string) => () => parseSections(`sections:\n${rows}\n`);

  it.each([
    ['  - { bar: 1.5, label: verse, tier: drive }', 'Line 2: bar must be a whole number from 1'],
    ['  - { bar: 0, label: verse, tier: drive }', 'Line 2: bar must be a whole number from 1'],
    ['  - { label: verse, tier: drive }', "Line 2: A section needs a 'bar'"],
    ['  - { bar: 1, tier: drive }', "Line 2: A section needs a 'label'"],
    ['  - { bar: 1, label: verse }', "Line 2: Section 'verse' needs a 'tier'"],
    ['  - { bar: 1, label: verse, tier: loud }', "Line 2: Unknown tier 'loud'"],
    ['  - { bar: 1, label: groovy, tier: drive }', "Line 2: Unknown label 'groovy'"],
    ['  - { bar: 1, label: roll, tier: drive }', "Line 2: 'roll' starts no section"],
    ['  - { bar: 1, label: verse, tier: drive, look: x }', "Line 2: Unknown key 'look'"],
    [
      '  - { bar: 5, label: verse, tier: drive }\n  - { bar: 5, label: chorus, tier: peak }',
      'Line 3: bar 5 is not after bar 5',
    ],
    ['  - verse', 'Line 2: Each of sections must be a mapping'],
  ])('names the line of a bad entry: %s', (rows, message) => {
    expect(bad(rows)).toThrow(message);
  });

  it('asks for a sections list', () => {
    expect(() => parseSections('song: x\n')).toThrow("Line 1: Unknown key 'song'");
    expect(() => parseSections('sections: []\n')).toThrow(
      'Line 1: sections must list at least one',
    );
    expect(() => parseSections('')).toThrow('The sections file must be a mapping');
  });
});
