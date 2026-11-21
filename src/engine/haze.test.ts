import { describe, expect, it } from 'vitest';
import type { FixtureProfile } from '../shared/fixture-profile';
import type { EngineEvent } from '../shared/protocol';
import { emptyShow, type HazePreset, type Show } from '../shared/show';
import {
  emptyPatch,
  putHazer,
  type Hazer,
  type PatchResult,
  type VenuePatch,
} from '../shared/venue-patch';
import { createHaze, hazerFrames } from './haze';

// A hazer in two modes: haze and fan, and haze with a channel nothing drives,
// held at 7.
const hazeProfile: FixtureProfile = {
  id: 'acme/haze',
  manufacturer: 'Acme',
  model: 'Haze',
  defaultRole: 'Wash',
  modes: [
    {
      name: '2ch',
      channels: [
        {
          kind: 'control',
          name: 'Haze',
          defaultValue: 0,
          ranges: [{ from: 0, to: 255, capability: { type: 'haze' } }],
        },
        {
          kind: 'control',
          name: 'Fan',
          defaultValue: 0,
          ranges: [{ from: 0, to: 255, capability: { type: 'fan' } }],
        },
      ],
    },
    {
      name: '3ch',
      channels: [
        {
          kind: 'control',
          name: 'Haze',
          defaultValue: 0,
          ranges: [{ from: 0, to: 255, capability: { type: 'haze' } }],
        },
        {
          kind: 'control',
          name: 'Program',
          defaultValue: 7,
          ranges: [{ from: 0, to: 255, capability: { type: 'none' } }],
        },
      ],
    },
  ],
};

function hazer(id: string, mode: string, address: number, overrides: Partial<Hazer> = {}): Hazer {
  return {
    ...{ id, name: id, profileId: 'acme/haze', mode, universe: 1, address },
    ...{ maxOutput: 1, fanLevel: 1, ...overrides },
  };
}

function ok(result: PatchResult): VenuePatch {
  if ('errors' in result) throw new Error(result.errors.join('\n'));
  return result.patch;
}

function patched(...hazers: Hazer[]): VenuePatch {
  return hazers.reduce(
    (patch, h) => ok(putHazer(patch, h, hazeProfile)),
    emptyPatch({ width: 10, depth: 8 }),
  );
}

// Universe 1's channels 1–6 for the haze `level`.
function channels(patch: VenuePatch, level: number, stage = new Map<number, Uint8Array>()) {
  return [...hazerFrames(patch, level, stage).get(1)!.slice(0, 6)];
}

describe('Hazer output', () => {
  it('sends the level times the max output on the haze range, and the fan at its level', () => {
    // 50% max output at 60% is 30% of 255; the fan is at 40%.
    const patch = patched(hazer('h', '2ch', 1, { maxOutput: 0.5, fanLevel: 0.4 }));

    expect(channels(patch, 0.6).slice(0, 2)).toEqual([77, 102]);
    expect(channels(patch, 1).slice(0, 2)).toEqual([128, 102]);
  });

  it('turns the fan on while the output is above 0, and off at 0', () => {
    const patch = patched(hazer('h', '2ch', 1));

    expect(channels(patch, 0).slice(0, 2)).toEqual([0, 0]);
    expect(channels(patch, 0.01).slice(0, 2)).toEqual([3, 255]);
    // A max output of 0 holds the output at 0, fan too.
    expect(channels(patched(hazer('h', '2ch', 1, { maxOutput: 0 })), 1).slice(0, 2)).toEqual([
      0, 0,
    ]);
  });

  it('leaves the other channels at their defaults', () => {
    expect(channels(patched(hazer('h', '3ch', 1)), 1).slice(0, 2)).toEqual([255, 7]);
    expect(channels(patched(hazer('h', '3ch', 1)), 0).slice(0, 2)).toEqual([0, 7]);
  });

  it('drives every Hazer, each by its own max output', () => {
    const patch = patched(
      hazer('a', '2ch', 1, { maxOutput: 0.5 }),
      hazer('b', '3ch', 5, { maxOutput: 1 }),
    );
    const frame = hazerFrames(patch, 1, new Map()).get(1)!;

    expect([frame[0], frame[4], frame[5]]).toEqual([128, 255, 7]);
  });

  it('writes over the stage frames, leaving the frames given alone', () => {
    const stage = new Uint8Array(512);
    stage[9] = 42;
    stage[0] = 99;
    const frames = new Map([[1, stage]]);

    const sent = hazerFrames(patched(hazer('h', '2ch', 1)), 1, frames).get(1)!;

    expect(sent[9]).toBe(42);
    expect(sent[0]).toBe(255);
    expect(stage[0]).toBe(99);
  });

  it('adds a frame for a Universe the stage frames lack', () => {
    expect(hazerFrames(patched(hazer('h', '2ch', 1)), 1, new Map()).get(1)?.[0]).toBe(255);
  });

  it('returns the stage frames as they are with no Hazers', () => {
    const frames = new Map([[1, new Uint8Array(512)]]);

    expect(hazerFrames(emptyPatch({ width: 10, depth: 8 }), 1, frames)).toBe(frames);
  });
});

const preset = (id: string, level: number, fade: number): HazePreset => ({
  id,
  name: id,
  level,
  fade,
});

// A haze with one Hazer at `max` and `fan`, and a Show with these Haze
// Presets. `clock` is in milliseconds. `at` gives the haze and fan channels.
function firingHaze(presets: HazePreset[], overrides: Partial<Hazer> = {}) {
  const venue = patched(hazer('h', '2ch', 1, overrides));
  let show: Show = { ...emptyShow(), hazePresets: presets };
  const clock = { now: 0 };
  const events: EngineEvent[] = [];
  const h = createHaze({
    patch: () => venue,
    show: () => show,
    now: () => clock.now,
    emit: (e) => events.push(e),
  });
  const at = (ms: number) => {
    clock.now = ms;
    return [...h.frames(new Map()).get(1)!.slice(0, 2)];
  };
  const edit = (next: HazePreset[]) => {
    show = { ...show, hazePresets: next };
    h.showEdited();
  };
  return { haze: h, events, at, clock, edit };
}

describe('firing Haze Presets', () => {
  it('is off before anything is fired', () => {
    const { at } = firingHaze([preset('light', 0.6, 5)]);

    expect(at(0)).toEqual([0, 0]);
    expect(at(10_000)).toEqual([0, 0]);
  });

  it('crossfades to 60% of a 50% max output, 30%, over a 5 s fade, the fan on from the start', () => {
    const { haze, at } = firingHaze([preset('light', 0.6, 5)], { maxOutput: 0.5, fanLevel: 0.4 });

    haze.fire('light');

    expect(at(0)).toEqual([0, 0]);
    expect(at(1)).toEqual([0, 102]);
    expect(at(2500)).toEqual([38, 102]);
    expect(at(5000)).toEqual([77, 102]);
    expect(at(9000)).toEqual([77, 102]);
  });

  it('starts a fade from where the one before has got to', () => {
    const { haze, at } = firingHaze([preset('up', 1, 2), preset('down', 0, 2)]);
    haze.fire('up');
    expect(at(1000)[0]).toBe(128);

    haze.fire('down');

    expect(at(1000)[0]).toBe(128);
    expect(at(2000)[0]).toBe(64);
    expect(at(3000)[0]).toBe(0);
  });

  it('holds one Haze Preset at a time, the last fired', () => {
    const { haze, at, events } = firingHaze([preset('light', 0.2, 0), preset('heavy', 0.8, 0)]);

    haze.fire('light');
    haze.fire('heavy');

    expect(at(0)[0]).toBe(204);
    expect(events.at(-1)).toEqual({ type: 'haze', fired: { type: 'preset', id: 'heavy' } });
  });

  it('keeps the fan on through a fade down and turns it off when the output reaches 0', () => {
    const { haze, at } = firingHaze([preset('on', 1, 0), preset('clear', 0, 4)]);
    haze.fire('on');
    at(0);

    haze.fire('clear');

    expect(at(0)).toEqual([255, 255]);
    expect(at(3900)[1]).toBe(255);
    expect(at(4000)).toEqual([0, 0]);
  });

  it('goes at once with no fade', () => {
    const { haze, at } = firingHaze([preset('light', 0.5, 0)]);

    haze.fire('light');

    expect(at(0)).toEqual([128, 255]);
  });

  it('does nothing for a Haze Preset the Show lacks', () => {
    const { haze, at, events } = firingHaze([]);
    const before = events.length;

    haze.fire('missing');

    expect(at(0)).toEqual([0, 0]);
    expect(events).toHaveLength(before);
  });

  it('reports what was fired last, from the start of its fade', () => {
    const { haze, events } = firingHaze([preset('light', 0.5, 5)]);

    haze.fire('light');

    expect(events).toEqual([{ type: 'haze', fired: { type: 'preset', id: 'light' } }]);
  });
});

describe('Haze Off', () => {
  it('goes to 0 at once in mid-fade, fan included', () => {
    const { haze, at, events } = firingHaze([preset('light', 1, 10)]);
    haze.fire('light');
    expect(at(5000)).toEqual([128, 255]);

    haze.off();

    expect(at(5000)).toEqual([0, 0]);
    expect(at(9000)).toEqual([0, 0]);
    expect(events.at(-1)).toEqual({ type: 'haze', fired: { type: 'off' } });
  });
});

describe('Haze safe state', () => {
  it('goes off at once when reset, as when a Show or Venue Patch is opened', () => {
    const { haze, at, events } = firingHaze([preset('light', 1, 0)]);
    haze.fire('light');
    expect(at(0)).toEqual([255, 255]);

    haze.reset();

    expect(at(0)).toEqual([0, 0]);
    expect(events.at(-1)).toEqual({ type: 'haze', fired: { type: 'off' } });
  });
});

describe('restoring the held Haze Preset', () => {
  it('jumps to the preset level at once, with no fade', () => {
    const { haze, at, events } = firingHaze([preset('light', 0.6, 5)]);

    haze.restore({ type: 'preset', id: 'light' });

    expect(at(0)).toEqual([153, 255]);
    expect(haze.snapshot()).toEqual({ type: 'preset', id: 'light' });
    expect(events.at(-1)).toEqual({ type: 'haze', fired: { type: 'preset', id: 'light' } });
  });

  it('restores Haze Off as 0', () => {
    const { haze, at } = firingHaze([preset('light', 0.6, 0)]);
    haze.fire('light');

    haze.restore({ type: 'off' });

    expect(at(0)).toEqual([0, 0]);
    expect(haze.snapshot()).toEqual({ type: 'off' });
  });

  it('restores none, output 0, when the Show lacks the Haze Preset', () => {
    const { haze, at } = firingHaze([preset('light', 0.6, 0)]);

    haze.restore({ type: 'preset', id: 'gone' });

    expect(at(0)).toEqual([0, 0]);
    expect(haze.snapshot()).toEqual({ type: 'none' });
  });
});

describe('editing the Show while a Haze Preset is held', () => {
  it('holds the output and reports none when the held Haze Preset is removed', () => {
    const { haze, at, events, edit } = firingHaze([preset('light', 0.6, 0), preset('heavy', 1, 0)]);
    haze.fire('light');

    edit([preset('heavy', 1, 0)]);

    expect(at(0)[0]).toBe(153);
    expect(events.at(-1)).toEqual({ type: 'haze', fired: { type: 'none' } });
  });

  it('does not report again when another Haze Preset is removed', () => {
    const { haze, events, edit } = firingHaze([preset('light', 0.6, 0), preset('heavy', 1, 0)]);
    haze.fire('light');
    events.length = 0;

    edit([preset('light', 0.6, 0)]);

    expect(events).toEqual([]);
  });

  it('leaves Haze Off alone', () => {
    const { haze, events, edit } = firingHaze([preset('light', 0.6, 0)]);
    haze.off();
    events.length = 0;

    edit([]);

    expect(events).toEqual([]);
  });

  it('crossfades to the new level over the fade when the held Haze Preset changes level', () => {
    const { haze, at, edit } = firingHaze([preset('light', 0.5, 0)]);
    haze.fire('light');
    expect(at(0)[0]).toBe(128);

    edit([preset('light', 1, 2)]);

    expect(at(0)[0]).toBe(128);
    expect(at(1000)[0]).toBe(191);
    expect(at(2000)[0]).toBe(255);
  });

  it('keeps the output when only the name, note or fade of the held Haze Preset changes', () => {
    const { haze, at, events, edit } = firingHaze([preset('light', 0.5, 0)]);
    haze.fire('light');
    events.length = 0;

    edit([{ ...preset('light', 0.5, 4), name: 'Renamed' }]);

    expect(at(1000)[0]).toBe(128);
    expect(events).toEqual([]);
  });
});
