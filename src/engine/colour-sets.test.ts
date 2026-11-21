import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixtureProfile } from '../shared/fixture-profile';
import type { EngineEvent, EngineSnapshot } from '../shared/protocol';
import { emptyShow, type ColourSet, type Rule, type Scene, type Show } from '../shared/show';
import { applyShowEdit, type ShowEdit } from '../shared/show-edit';
import { createColourSets } from './colour-sets';
import { createEngine } from './engine';
import type { MidiPorts } from './midi-input';
import { colourLevels } from './scene-resolution';

const red: ColourSet = {
  id: 'red',
  name: 'Red',
  colours: {
    Primary: { swatch: 'Red' },
    Secondary: { swatch: 'Green' },
    Accent: { swatch: 'White' },
  },
  fade: 0,
};
const blue: ColourSet = {
  id: 'blue',
  name: 'Blue',
  colours: {
    Primary: { swatch: 'Blue' },
    Secondary: { swatch: 'Red' },
    Accent: { swatch: 'White' },
  },
  fade: 4,
};

const withSets = (...colourSets: ColourSet[]): Show => ({ ...emptyShow(), colourSets });

// The held Colour Set module over a Show the test can change, at a clock it
// sets, in ms.
function held(initial: Show) {
  const state = { show: initial, now: 0 };
  const events: EngineEvent[] = [];
  const sets = createColourSets({
    show: () => state.show,
    now: () => state.now,
    emit: (e) => events.push(e),
  });
  return { state, sets, events };
}

describe('held Colour Set', () => {
  it('holds none and shows the Default Colour when the Show has no Colour Sets', () => {
    const { sets, state } = held({ ...emptyShow(), defaultColour: { swatch: 'Amber' } });
    sets.reset();

    expect(sets.snapshot()).toEqual({});
    expect(sets.slots().Primary).toEqual(colourLevels({ swatch: 'Amber' }));
    expect(sets.slots().Accent).toEqual(colourLevels({ swatch: 'Amber' }));
    expect(state.show.colourSets).toBeUndefined();
  });

  it('holds the first Colour Set when a Show is opened, at once', () => {
    const { sets } = held(withSets(blue, red));

    sets.reset();

    expect(sets.snapshot()).toEqual({ id: 'blue' });
    expect(sets.slots().Primary).toEqual(colourLevels({ swatch: 'Blue' }));
  });

  it('crossfades every slot colour over the fired set fade, from where it is', () => {
    const { sets, state } = held(withSets({ ...red, fade: 2 }, blue));
    sets.reset();

    state.now = 1000;
    sets.fire('blue');
    expect(sets.slots().Primary).toEqual(colourLevels({ swatch: 'Red' }));

    state.now = 3000;
    const mid = sets.slots();
    expect(mid.Primary.red).toBeCloseTo(0.5);
    expect(mid.Primary.blue).toBeCloseTo(0.5);
    // Secondary goes from green to red.
    expect(mid.Secondary.green).toBeCloseTo(0.5);
    expect(mid.Secondary.red).toBeCloseTo(0.5);

    // A change in the middle of a fade starts from what is shown.
    sets.fire('red');
    expect(sets.slots().Primary.blue).toBeCloseTo(0.5);
    state.now = 4000;
    expect(sets.slots().Primary.red).toBeCloseTo(0.75);
  });

  it('ignores a Colour Set the Show lacks', () => {
    const { sets } = held(withSets(red));
    sets.reset();

    sets.fire('nope');

    expect(sets.snapshot()).toEqual({ id: 'red' });
  });

  it('falls back to the first Colour Set when the held one is removed', () => {
    const { sets, state, events } = held(withSets(red, blue));
    sets.reset();
    sets.fire('blue');

    state.show = withSets(red);
    sets.showEdited();

    expect(sets.snapshot()).toEqual({ id: 'red' });
    expect(events.at(-1)).toEqual({ type: 'colourSet', held: { id: 'red' } });
  });

  it('holds none when the last Colour Set is removed, and the first one when one is added', () => {
    const { sets, state } = held(withSets(red));
    sets.reset();

    state.show = emptyShow();
    sets.showEdited();
    expect(sets.snapshot()).toEqual({});

    state.show = withSets(blue);
    sets.showEdited();
    expect(sets.snapshot()).toEqual({ id: 'blue' });
  });

  it('crossfades to the new colours when the held Colour Set is edited', () => {
    const { sets, state } = held(withSets(blue));
    sets.reset();

    state.show = withSets({ ...blue, colours: { ...blue.colours, Primary: { swatch: 'Green' } } });
    state.now = 2000;
    sets.showEdited();
    expect(sets.slots().Primary.blue).toBeCloseTo(1);

    state.now = 4000;
    expect(sets.slots().Primary.blue).toBeCloseTo(0.5);
  });

  it('restores the held Colour Set at once, or the first when the Show lacks it', () => {
    const { sets } = held(withSets(red, blue));

    sets.restore({ id: 'blue' });
    expect(sets.snapshot()).toEqual({ id: 'blue' });
    expect(sets.slots().Primary).toEqual(colourLevels({ swatch: 'Blue' }));

    sets.restore({ id: 'gone' });
    expect(sets.snapshot()).toEqual({ id: 'red' });
  });
});

describe('Colour Set edits', () => {
  it('adds, moves and removes Colour Sets', () => {
    const put = (show: Show, set: ColourSet): Show => {
      const result = applyShowEdit(show, { type: 'putColourSet', set });
      if (!('show' in result)) throw new Error(result.errors.join());
      return result.show;
    };
    const added = put(put(emptyShow(), red), blue);
    expect(added.colourSets).toEqual([red, blue]);

    const moved = applyShowEdit(added, { type: 'moveColourSet', id: 'blue', to: 0 });
    expect('show' in moved && moved.show.colourSets).toEqual([blue, red]);

    const removed = applyShowEdit(added, { type: 'removeColourSet', id: 'red' });
    expect('show' in removed && removed.show.colourSets).toEqual([blue]);
  });
});

// An RGB Fixture and an engine around it, driven by MIDI notes and a clock.
const rgb: FixtureProfile = {
  id: 'acme/rgb',
  manufacturer: 'Acme',
  model: 'RGB',
  defaultRole: 'Wash',
  modes: [
    {
      name: 'rgb',
      channels: (['intensity', 'red', 'green', 'blue'] as const).map((kind) => ({
        kind: 'control' as const,
        name: kind,
        defaultValue: 0,
        ranges: [
          {
            from: 0,
            to: 255,
            capability:
              kind === 'intensity'
                ? ({ type: 'intensity' } as const)
                : ({ type: 'emitter', emitter: kind } as const),
          },
        ],
      })),
    },
  ],
};

function midiPorts() {
  let send: (message: number[]) => void = () => {};
  const ports: MidiPorts = {
    list: () => ['Pads'],
    open(_name, onMessage) {
      send = onMessage;
      return { close: () => {} };
    },
  };
  return {
    ports,
    noteOn: (channel: number, note: number) => send([0x90 | (channel - 1), note, 100]),
  };
}

const rule = (colour: Rule['colour']): Rule => ({ target: {}, intensity: 1, colour });
const scene = (id: string, rules: Rule[], layer = 'layer-1'): Scene => ({
  id,
  name: id,
  tags: [],
  layer,
  fadeIn: 0,
  rules,
});

function colourEngine() {
  const events: EngineEvent[] = [];
  const clock = { now: 0 };
  const midi = midiPorts();
  const engine = createEngine({
    emit: (e) => events.push(e),
    now: () => clock.now,
    midiPorts: midi.ports,
  });
  let requestId = 1;
  engine.handle({ type: 'saveProfile', requestId: 0, profile: rgb });
  engine.handle({
    type: 'editVenue',
    requestId: requestId++,
    edit: {
      type: 'putFixture',
      fixture: {
        id: 'f1',
        name: 'F1',
        profileId: 'acme/rgb',
        mode: 'rgb',
        universe: 1,
        address: 1,
        x: 0,
        y: 1,
        height: 0,
      },
    },
  });
  const edit = (e: ShowEdit): string[] => {
    const id = requestId++;
    engine.handle({ type: 'editShow', requestId: id, edit: e });
    const reply = events.find((ev) => ev.type === 'showDone' && ev.requestId === id);
    return reply?.type === 'showDone' ? reply.errors : ['No reply'];
  };
  return {
    engine,
    events,
    clock,
    midi,
    edit,
    // The Fixture's colour in the preview now.
    colour() {
      events.length = 0;
      engine.handle({ type: 'startPreview' });
      engine.handle({ type: 'stopPreview' });
      const preview = events.find((e) => e.type === 'preview');
      if (preview?.type !== 'preview') throw new Error('No preview');
      const { red, green, blue } = preview.lights.f1!;
      return { red, green, blue };
    },
  };
}

describe('engine Colour Sets', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the held set in slot colours in Rules and in Step colour Effects', () => {
    const s = colourEngine();
    s.edit({ type: 'putColourSet', set: red });
    s.edit({ type: 'putScene', scene: scene('wash', [rule({ slot: 'Primary' })]) });
    s.engine.handle({ type: 'goScene', sceneId: 'wash' });
    expect(s.colour()).toEqual({ red: 1, green: 0, blue: 0 });

    s.edit({
      type: 'putScene',
      scene: scene('step', [
        {
          target: {},
          intensity: 1,
          colourEffect: {
            shape: 'Step',
            colours: [{ slot: 'Secondary' }, { slot: 'Secondary' }],
            length: 4,
            spread: 'In sync',
          },
        },
      ]),
    });
    s.engine.handle({ type: 'goScene', sceneId: 'step' });
    expect(s.colour()).toEqual({ red: 0, green: 1, blue: 0 });
  });

  it('fires a Colour Set with its note, Go only, and crossfades while the Scene stays active', () => {
    const s = colourEngine();
    s.edit({ type: 'putColourSet', set: red });
    s.edit({
      type: 'putColourSet',
      set: { ...blue, note: { channel: 3, note: 70 } },
    });
    s.edit({ type: 'putScene', scene: scene('wash', [rule({ slot: 'Primary' })]) });
    s.engine.handle({ type: 'goScene', sceneId: 'wash' });
    s.engine.handle({ type: 'selectMidiInput', name: 'Pads' });
    vi.advanceTimersByTime(1000);
    s.clock.now = 10_000;

    s.midi.noteOn(3, 70);
    expect(s.colour()).toEqual({ red: 1, green: 0, blue: 0 });
    s.clock.now = 12_000;
    const mid = s.colour();
    expect(mid.red).toBeCloseTo(0.5);
    expect(mid.blue).toBeCloseTo(0.5);
    s.clock.now = 14_000;
    expect(s.colour()).toEqual({ red: 0, green: 0, blue: 1 });

    s.engine.handle({ type: 'getPlayback' });
    const playback = s.events.findLast((e) => e.type === 'playback');
    expect(playback?.type === 'playback' && playback.active).toEqual({ 'layer-1': 'wash' });
  });

  it('holds the first set at launch of a Show and shows the Default Colour with none', () => {
    const s = colourEngine();
    s.edit({ type: 'setDefaultColour', colour: { swatch: 'Amber' } });
    s.edit({ type: 'putScene', scene: scene('wash', [rule({ slot: 'Accent' })]) });
    s.engine.handle({ type: 'goScene', sceneId: 'wash' });
    const amber = s.colour();
    expect(amber.red).toBe(1);
    expect(amber.blue).toBe(0);

    s.edit({ type: 'putColourSet', set: { ...blue, fade: 0 } });
    s.engine.handle({ type: 'getColourSet' });
    expect(s.events.findLast((e) => e.type === 'colourSet')).toEqual({
      type: 'colourSet',
      held: { id: 'blue' },
    });
  });

  it('refuses a Colour Set note that is a Trigger, a House Preset or a Haze Preset note', () => {
    const s = colourEngine();
    const note = { channel: 1, note: 60 };
    s.edit({ type: 'putScene', scene: scene('wash', []) });
    s.edit({ type: 'putTrigger', trigger: { ...note, scene: 'wash', mode: 'go' } });
    s.edit({
      type: 'putHousePreset',
      preset: { id: 'dim', name: 'Dim', fade: 0, note: { channel: 1, note: 61 } },
    });
    s.edit({
      type: 'putHazePreset',
      preset: { id: 'mist', name: 'Mist', level: 0.5, fade: 0, note: { channel: 1, note: 62 } },
    });

    expect(s.edit({ type: 'putColourSet', set: { ...red, note } })).toEqual([
      'Colour Set "Red": note 1/60 is also a Trigger',
    ]);
    expect(
      s.edit({ type: 'putColourSet', set: { ...red, note: { channel: 1, note: 61 } } }),
    ).toEqual(['Colour Set "Red": note 1/61 is also a House Preset']);
    expect(
      s.edit({ type: 'putColourSet', set: { ...red, note: { channel: 1, note: 62 } } }),
    ).toEqual(['Colour Set "Red": note 1/62 is also a Haze Preset']);
  });

  describe('recovery', () => {
    function snapshotOf(fire?: string): EngineSnapshot {
      const s = colourEngine();
      s.edit({ type: 'putColourSet', set: red });
      s.edit({ type: 'putColourSet', set: { ...blue, fade: 0 } });
      if (fire) s.engine.handle({ type: 'fireColourSet', id: fire });
      return s.engine.snapshot();
    }

    it('restores the held set at once, with no fade', () => {
      const before = snapshotOf('blue');
      const after = colourEngine();

      after.engine.restore(before);

      expect(before.colourSet).toEqual({ id: 'blue' });
      expect(after.engine.snapshot().colourSet).toEqual({ id: 'blue' });
    });

    it('goes to the first set when the Show lost the held one', () => {
      const before = snapshotOf('blue');
      const document = { ...before.show.document, colourSets: [red] };
      const after = colourEngine();

      after.engine.restore({ ...before, show: { ...before.show, document } });

      expect(after.engine.snapshot().colourSet).toEqual({ id: 'red' });
    });

    it('holds the first set when a Show is opened', () => {
      const s = colourEngine();
      s.edit({ type: 'putColourSet', set: red });
      s.edit({ type: 'putColourSet', set: { ...blue, fade: 0 } });
      s.engine.handle({ type: 'fireColourSet', id: 'blue' });

      s.engine.handle({ type: 'newShow' });

      expect(s.engine.snapshot().colourSet).toEqual({});
    });
  });
});
