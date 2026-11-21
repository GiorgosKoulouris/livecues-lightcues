import { describe, expect, it } from 'vitest';
import {
  emptyShow,
  findHazePresetOn,
  validateShow,
  type HazePreset,
  type HousePreset,
  type Rule,
  type Scene,
  type Show,
  type Trigger,
} from './show';

function scene(overrides: Partial<Scene>): Scene {
  return { id: 's1', name: 'Scene', tags: [], layer: 'l1', fadeIn: 0, rules: [], ...overrides };
}

function show(...scenes: Scene[]): Show {
  return { layers: [{ id: 'l1', name: 'Layer 1' }], scenes, triggers: [] };
}

describe('validateShow', () => {
  it('accepts Rules with in-range settings', () => {
    const rules: Rule[] = [
      { target: {}, intensity: 0, colour: { hue: 0, saturation: 0 } },
      {
        target: {
          zones: [{ row: 'Front', column: 'Stage Left', level: 'Floor' }],
          roles: ['Strobe'],
        },
        intensity: 1,
        colour: { hue: 359.9, saturation: 1 },
      },
      { target: { roles: ['Effect'] }, colour: { swatch: 'UV' } },
      { target: {}, direction: 'Audience' },
      {
        target: {},
        movementEffect: { shape: 'Ballyhoo', size: 25, length: 16, spread: 'Alternate' },
      },
      { target: {}, movementEffect: { shape: 'Circle', size: 5, length: 0.25, spread: 'In sync' } },
      { target: {}, movementEffect: { shape: 'Circle', size: 5, length: 0.5, spread: 'In sync' } },
      { target: {}, movementEffect: 'None', intensityEffect: 'None', colourEffect: 'None' },
      {
        target: {},
        intensityEffect: { shape: 'Pulse', depth: 1, length: 0.25, spread: 'Left→Right' },
      },
      { target: {}, intensityEffect: { shape: 'Chase', depth: 0, length: 16, spread: 'Mirrored' } },
      {
        target: {},
        intensityEffect: { shape: 'Random', depth: 1, length: 1, spread: 'In sync', width: 0.5 },
      },
      {
        target: {},
        intensityEffect: { shape: 'Chase', depth: 1, length: 1, spread: 'In sync', width: 1 / 3 },
      },
      {
        target: {},
        colourEffect: {
          shape: 'Step',
          colours: [{ swatch: 'Red' }, { hue: 240, saturation: 1 }],
          length: 1,
          spread: 'Alternate',
        },
      },
      {
        target: {},
        colourEffect: {
          shape: 'Fade',
          colours: [{ swatch: 'Red' }, { swatch: 'Blue' }, { swatch: 'Green' }, { swatch: 'UV' }],
          length: 0.5,
          spread: 'In sync',
        },
      },
      { target: {}, colourEffect: { shape: 'Rainbow', length: 16, spread: 'Left→Right' } },
      { target: {}, strobe: 'Off' },
      { target: {}, strobe: 'Fast' },
      { target: {}, strobe: 0.25 },
      { target: {}, prism: 'Off', gobo: 'Open' },
      { target: {}, prism: 'On', gobo: 'Gobo' },
      { target: {}, prism: 'Rotate slow' },
      { target: {}, prism: 'Rotate fast' },
    ];

    expect(validateShow(show(scene({ rules })))).toEqual([]);
  });

  it('rejects a prism or gobo setting it does not know', () => {
    const rules = [
      { target: {}, prism: 'Spin' },
      { target: {}, gobo: 'Star' },
    ] as unknown as Rule[];

    expect(validateShow(show(scene({ name: 'Verse', rules })))).toEqual([
      'Scene "Verse" Rule 1: prism must be Off, On, Rotate slow or Rotate fast',
      'Scene "Verse" Rule 2: gobo must be Open or Gobo',
    ]);
  });

  it('rejects Rules with out-of-range settings or unknown targets', () => {
    const rules = [
      { target: { zones: [] }, intensity: 1.5 },
      { target: { roles: [] }, colour: { hue: 360, saturation: 0.5 } },
      { target: {}, intensity: Number.NaN, colour: { hue: 10, saturation: -0.1 } },
      {
        target: {
          zones: [{ row: 'Balcony', column: 'Centre', level: 'Floor' }],
          roles: ['Laser'],
        },
        colour: { swatch: 'Teal' },
        direction: 'Sideways',
      },
      { target: {}, movementEffect: { shape: 'Figure 8', size: 0, length: 3, spread: 'Zigzag' } },
      { target: {}, movementEffect: { shape: 'Circle', size: 181, length: 1, spread: 'In sync' } },
      { target: {}, strobe: 'Strobe' },
      { target: {}, strobe: 2 },
      { target: {}, movementEffect: 'Off', intensityEffect: 'Pulse', colourEffect: null },
      {
        target: {},
        intensityEffect: { shape: 'Flicker', depth: 1.5, length: 3, spread: 'Zigzag' },
      },
      {
        target: {},
        intensityEffect: { shape: 'Square', depth: -0.1, length: 1, spread: 'In sync' },
      },
      {
        target: {},
        colourEffect: { shape: 'Strobe', colours: [], length: 3, spread: 'Zigzag' },
      },
      {
        target: {},
        colourEffect: { shape: 'Step', colours: [{ swatch: 'Red' }], length: 1, spread: 'In sync' },
      },
      {
        target: {},
        colourEffect: {
          shape: 'Fade',
          colours: [
            { swatch: 'Red' },
            { swatch: 'Teal' },
            { hue: 360, saturation: 1 },
            { swatch: 'Blue' },
            { swatch: 'Green' },
          ],
          length: 1,
          spread: 'In sync',
        },
      },
      {
        target: {},
        colourEffect: { shape: 'Step', colours: 'Red', length: 1, spread: 'In sync' },
      },
      {
        target: {},
        colourEffect: { shape: 'Rainbow', colours: [], length: 1, spread: 'In sync' },
      },
      {
        target: {},
        colour: { swatch: 'Red' },
        colourEffect: { shape: 'Rainbow', length: 1, spread: 'In sync' },
      },
      { target: {}, colour: { swatch: 'Red' }, colourEffect: 'None' },
      {
        target: {},
        intensityEffect: { shape: 'Pulse', depth: 1, length: 1, spread: 'In sync', width: 0.5 },
      },
      {
        target: {},
        intensityEffect: { shape: 'Chase', depth: 1, length: 1, spread: 'In sync', width: 0.4 },
      },
    ] as unknown as Rule[];

    expect(validateShow(show(scene({ name: 'Verse', rules })))).toEqual([
      'Scene "Verse" Rule 1: Zone list is empty',
      'Scene "Verse" Rule 1: intensity must be from 0 to 1',
      'Scene "Verse" Rule 2: Role list is empty',
      'Scene "Verse" Rule 2: hue must be from 0 to under 360',
      'Scene "Verse" Rule 3: intensity must be from 0 to 1',
      'Scene "Verse" Rule 3: saturation must be from 0 to 1',
      'Scene "Verse" Rule 4: Zone Balcony/Centre/Floor is not on the stage grid',
      'Scene "Verse" Rule 4: Role "Laser" is not a Role',
      'Scene "Verse" Rule 4: "Teal" is not a swatch',
      'Scene "Verse" Rule 4: "Sideways" is not a Direction',
      'Scene "Verse" Rule 5: "Figure 8" is not a movement Effect shape',
      'Scene "Verse" Rule 5: Effect size must be over 0 and at most 180 degrees',
      'Scene "Verse" Rule 5: Effect length must be 1/4, 1/2, 1, 2, 4, 8 or 16 beats',
      'Scene "Verse" Rule 5: "Zigzag" is not a Spread',
      'Scene "Verse" Rule 6: Effect size must be over 0 and at most 180 degrees',
      'Scene "Verse" Rule 7: strobe must be Off, Slow, Medium, Fast, or 1, 1/2 or 1/4 beat',
      'Scene "Verse" Rule 8: strobe must be Off, Slow, Medium, Fast, or 1, 1/2 or 1/4 beat',
      'Scene "Verse" Rule 9: movement Effect must be None or an Effect',
      'Scene "Verse" Rule 9: intensity Effect must be None or an Effect',
      'Scene "Verse" Rule 9: colour Effect must be None or an Effect',
      'Scene "Verse" Rule 10: "Flicker" is not an intensity Effect shape',
      'Scene "Verse" Rule 10: Effect depth must be from 0 to 1',
      'Scene "Verse" Rule 10: Effect length must be 1/4, 1/2, 1, 2, 4, 8 or 16 beats',
      'Scene "Verse" Rule 10: "Zigzag" is not a Spread',
      'Scene "Verse" Rule 11: Effect depth must be from 0 to 1',
      'Scene "Verse" Rule 12: "Strobe" is not a colour Effect shape',
      'Scene "Verse" Rule 12: Effect length must be 1/4, 1/2, 1, 2, 4, 8 or 16 beats',
      'Scene "Verse" Rule 12: "Zigzag" is not a Spread',
      'Scene "Verse" Rule 13: a colour Effect must have 2 to 4 colours',
      'Scene "Verse" Rule 14: a colour Effect must have 2 to 4 colours',
      'Scene "Verse" Rule 14: colour 2: "Teal" is not a swatch',
      'Scene "Verse" Rule 14: colour 3: hue must be from 0 to under 360',
      'Scene "Verse" Rule 15: a colour Effect must have 2 to 4 colours',
      'Scene "Verse" Rule 16: Rainbow takes no colours',
      'Scene "Verse" Rule 17: a Rule sets a colour or a colour Effect, not both',
      'Scene "Verse" Rule 18: a Rule sets a colour or a colour Effect, not both',
      'Scene "Verse" Rule 19: only a Chase or Random takes a width',
      'Scene "Verse" Rule 20: Effect width must be 1/4, 1/3 or 1/2',
    ]);
  });

  it('rejects bad fade times, tags and repeated ids', () => {
    const invalid: Show = {
      layers: [
        { id: 'l1', name: 'Layer 1' },
        { id: 'l1', name: 'Layer 1 again' },
      ],
      scenes: [
        scene({ name: 'Verse', fadeIn: -1, tags: ['calm', '', 'calm'] }),
        scene({ name: 'Chorus', fadeIn: Number.POSITIVE_INFINITY, tags: [' loud'] }),
      ],
      triggers: [],
    };

    expect(validateShow(invalid)).toEqual([
      'Layer id "l1" is used twice',
      'Scene "Verse": fade-in must be 0 seconds or more',
      'Scene "Verse": tag "" is empty',
      'Scene "Verse": tag "calm" is listed twice',
      'Scene "Chorus": fade-in must be 0 seconds or more',
      'Scene "Chorus": tag " loud" has surrounding spaces',
      'Scene id "s1" is used twice',
    ]);
  });

  it('rejects Triggers outside MIDI ranges, of unknown modes or on a used note', () => {
    const triggers = [
      { channel: 0, note: 128, scene: 's1', mode: 'go' },
      { channel: 2.5, note: -1, scene: 's1', mode: 'toggle' },
      { channel: 16, note: 127, scene: 's1', mode: 'flash' },
      { channel: 16, note: 127, scene: 's1', mode: 'release' },
    ] as unknown as Trigger[];

    expect(validateShow({ ...show(scene({})), triggers })).toEqual([
      'Trigger 0/128: channel must be a whole number from 1 to 16',
      'Trigger 0/128: note must be a whole number from 0 to 127',
      'Trigger 2.5/-1: channel must be a whole number from 1 to 16',
      'Trigger 2.5/-1: note must be a whole number from 0 to 127',
      'Trigger 2.5/-1: mode "toggle" is not go, flash or release',
      'Trigger 16/127 is mapped twice',
    ]);
  });
});

describe('a new Show', () => {
  it('starts with one Layer and nothing else', () => {
    expect(emptyShow()).toEqual({
      layers: [{ id: 'layer-1', name: 'Layer 1' }],
      scenes: [],
      triggers: [],
    });
  });
});

describe('House Presets', () => {
  const dim: HousePreset = { id: 'dim', name: 'Dim', fade: 3 };
  const up: HousePreset = { id: 'up', name: 'Up', fade: 5, note: { channel: 2, note: 10 } };

  function withPresets(...housePresets: HousePreset[]): Show {
    return { ...emptyShow(), housePresets };
  }

  it('rejects bad fades, notes outside MIDI ranges and repeated ids', () => {
    const presets = [
      { ...dim, fade: -1 },
      { ...up, fade: Number.NaN, note: { channel: 17, note: 1.5 } },
      { ...dim, name: 'Again' },
      { id: '', name: ' ', fade: 0 },
    ];

    expect(validateShow(withPresets(...presets))).toEqual([
      'House Preset "Dim": fade must be 0 seconds or more',
      'House Preset "Up": fade must be 0 seconds or more',
      'House Preset "Up": channel must be a whole number from 1 to 16',
      'House Preset "Up": note must be a whole number from 0 to 127',
      'House Preset " ": id is missing',
      'House Preset " ": name is empty',
      'House Preset id "dim" is used twice',
    ]);
  });
});

describe('Haze Presets', () => {
  const light: HazePreset = { id: 'light', name: 'Light', level: 0.3, fade: 3 };
  const heavy: HazePreset = {
    id: 'heavy',
    name: 'Heavy',
    level: 0.9,
    fade: 5,
    note: { channel: 2, note: 20 },
  };

  function withPresets(...hazePresets: HazePreset[]): Show {
    return { ...emptyShow(), hazePresets };
  }

  it('finds a Haze Preset by its note', () => {
    expect(findHazePresetOn(withPresets(light, heavy), { channel: 2, note: 20 })).toEqual(heavy);
    expect(findHazePresetOn(withPresets(light, heavy), { channel: 1, note: 20 })).toBeUndefined();
  });

  it('rejects bad levels and fades, notes outside MIDI ranges and repeated ids', () => {
    const presets = [
      { ...light, level: 1.5, fade: -1 },
      { ...heavy, level: Number.NaN, note: { channel: 17, note: 1.5 } },
      { ...light, name: 'Again' },
      { id: '', name: ' ', level: 0, fade: 0 },
    ];

    expect(validateShow(withPresets(...presets))).toEqual([
      'Haze Preset "Light": level must be within 0–1',
      'Haze Preset "Light": fade must be 0 seconds or more',
      'Haze Preset "Heavy": level must be within 0–1',
      'Haze Preset "Heavy": channel must be a whole number from 1 to 16',
      'Haze Preset "Heavy": note must be a whole number from 0 to 127',
      'Haze Preset " ": id is missing',
      'Haze Preset " ": name is empty',
      'Haze Preset id "light" is used twice',
    ]);
  });
});
