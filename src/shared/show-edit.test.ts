import { describe, expect, it } from 'vitest';
import { applyShowEdit } from './show-edit';
import {
  emptyShow,
  validateShow,
  type HazePreset,
  type HousePreset,
  type Scene,
  type Show,
} from './show';

function scene(overrides: Partial<Scene>): Scene {
  return { id: 's1', name: 'Scene', tags: [], layer: 'l1', fadeIn: 0, rules: [], ...overrides };
}

// The Show after an edit that must be accepted.
function applied(show: Show, edit: Parameters<typeof applyShowEdit>[1]): Show {
  const result = applyShowEdit(show, edit);
  if ('errors' in result) throw new Error(result.errors.join('\n'));
  return result.show;
}

describe('editing a Show', () => {
  it('adds a Scene, then replaces it by id', () => {
    const added = applied(emptyShow(), {
      type: 'putScene',
      scene: scene({ layer: 'layer-1', name: 'Verse' }),
    });

    expect(
      applyShowEdit(added, {
        type: 'putScene',
        scene: scene({ layer: 'layer-1', name: 'Verse 2' }),
      }),
    ).toEqual({
      show: { ...emptyShow(), scenes: [scene({ layer: 'layer-1', name: 'Verse 2' })] },
    });
  });

  it('refuses a Scene that makes the Show invalid', () => {
    expect(
      applyShowEdit(emptyShow(), {
        type: 'putScene',
        scene: scene({ name: 'Verse', layer: 'nope' }),
      }),
    ).toEqual({ errors: ['Scene "Verse": Layer "nope" is not in the Show'] });
  });

  it('removes a Scene with its Triggers and its Base Look designation', () => {
    const verse = scene({ id: 'verse', layer: 'layer-1' });
    const hit = scene({ id: 'hit', layer: 'layer-1' });
    const before: Show = {
      ...emptyShow(),
      scenes: [verse, hit],
      triggers: [
        { channel: 1, note: 60, scene: 'verse', mode: 'go' },
        { channel: 1, note: 61, scene: 'hit', mode: 'flash' },
      ],
      baseLook: 'verse',
    };

    expect(applyShowEdit(before, { type: 'removeScene', id: 'verse' })).toEqual({
      show: {
        ...emptyShow(),
        scenes: [hit],
        triggers: [{ channel: 1, note: 61, scene: 'hit', mode: 'flash' }],
      },
    });
    expect(applied(before, { type: 'removeScene', id: 'hit' })).toMatchObject({
      baseLook: 'verse',
    });
  });

  it('refuses to remove a Scene that is not in the Show', () => {
    expect(applyShowEdit(emptyShow(), { type: 'removeScene', id: 'nope' })).toEqual({
      errors: ['Scene id "nope" is not in the Show'],
    });
  });

  it('adds and renames Layers, keeping their order', () => {
    const added = applied(emptyShow(), {
      type: 'putLayer',
      layer: { id: 'accents', name: 'Accents' },
    });

    expect(
      applyShowEdit(added, { type: 'putLayer', layer: { id: 'layer-1', name: 'Base' } }),
    ).toEqual({
      show: {
        ...emptyShow(),
        layers: [
          { id: 'layer-1', name: 'Base' },
          { id: 'accents', name: 'Accents' },
        ],
      },
    });
  });

  it('removes a Layer with its Scenes and their Triggers', () => {
    const before: Show = {
      layers: [
        { id: 'base', name: 'Base' },
        { id: 'accents', name: 'Accents' },
      ],
      scenes: [scene({ id: 'verse', layer: 'base' }), scene({ id: 'hit', layer: 'accents' })],
      triggers: [
        { channel: 1, note: 60, scene: 'verse', mode: 'go' },
        { channel: 1, note: 61, scene: 'hit', mode: 'flash' },
      ],
      baseLook: 'hit',
    };

    expect(applyShowEdit(before, { type: 'removeLayer', id: 'accents' })).toEqual({
      show: {
        layers: [{ id: 'base', name: 'Base' }],
        scenes: [scene({ id: 'verse', layer: 'base' })],
        triggers: [{ channel: 1, note: 60, scene: 'verse', mode: 'go' }],
      },
    });
  });

  it('refuses to remove a Layer that is not in the Show', () => {
    expect(applyShowEdit(emptyShow(), { type: 'removeLayer', id: 'nope' })).toEqual({
      errors: ['Layer id "nope" is not in the Show'],
    });
  });

  it('maps a note to a Scene, replacing what the note fired before', () => {
    const before: Show = {
      ...emptyShow(),
      scenes: [scene({ id: 'verse', layer: 'layer-1' }), scene({ id: 'hit', layer: 'layer-1' })],
      triggers: [{ channel: 1, note: 60, scene: 'verse', mode: 'go' }],
    };
    const put = (trigger: Show['triggers'][number]) =>
      applyShowEdit(before, { type: 'putTrigger', trigger });

    expect(put({ channel: 1, note: 60, scene: 'hit', mode: 'flash' })).toEqual({
      show: { ...before, triggers: [{ channel: 1, note: 60, scene: 'hit', mode: 'flash' }] },
    });
    expect(put({ channel: 1, note: 61, scene: 'outro', mode: 'go' })).toEqual({
      errors: ['Trigger 1/61: Scene "outro" is not in the Show'],
    });
    expect(
      applyShowEdit(before, { type: 'removeTrigger', note: { channel: 1, note: 60 } }),
    ).toEqual({
      show: { ...before, triggers: [] },
    });
  });

  it('refuses to remove a Trigger that is not mapped', () => {
    expect(
      applyShowEdit(emptyShow(), { type: 'removeTrigger', note: { channel: 3, note: 9 } }),
    ).toEqual({ errors: ['No Trigger is mapped to channel 3, note 9'] });
  });

  it('designates a Scene as the Base Look, or none', () => {
    const before: Show = { ...emptyShow(), scenes: [scene({ id: 'verse', layer: 'layer-1' })] };
    const designated = applied(before, { type: 'setBaseLook', sceneId: 'verse' });

    expect(designated.baseLook).toBe('verse');
    expect(applyShowEdit(designated, { type: 'setBaseLook' })).toEqual({ show: before });
    expect(applyShowEdit(before, { type: 'setBaseLook', sceneId: 'outro' })).toEqual({
      errors: ['Base Look: Scene "outro" is not in the Show'],
    });
  });

  it('sets the default colour, or White without one', () => {
    const before = emptyShow();
    const set = applied(before, { type: 'setDefaultColour', colour: { swatch: 'Warm White' } });

    expect(set.defaultColour).toEqual({ swatch: 'Warm White' });
    expect(applyShowEdit(set, { type: 'setDefaultColour' })).toEqual({ show: before });
    expect(
      applyShowEdit(before, { type: 'setDefaultColour', colour: { hue: 400, saturation: 1 } }),
    ).toEqual({ errors: ['Default colour: hue must be from 0 to under 360'] });
  });

  it('sets the Default Direction, or Down without one', () => {
    const before = emptyShow();
    const set = applied(before, { type: 'setDefaultDirection', direction: 'Audience' });

    expect(set.defaultDirection).toBe('Audience');
    expect(applyShowEdit(set, { type: 'setDefaultDirection' })).toEqual({ show: before });
    expect(
      applyShowEdit(before, { type: 'setDefaultDirection', direction: 'Sideways' as never }),
    ).toEqual({ errors: ['Default Direction: "Sideways" is not a Direction'] });
  });
});

describe('House Presets', () => {
  const dim: HousePreset = { id: 'dim', name: 'Dim', fade: 3 };
  const up: HousePreset = { id: 'up', name: 'Up', fade: 5, note: { channel: 2, note: 10 } };

  function withPresets(...housePresets: HousePreset[]): Show {
    return { ...emptyShow(), housePresets };
  }

  const put = (show: Show, preset: HousePreset) =>
    applyShowEdit(show, { type: 'putHousePreset', preset });

  it('adds House Presets at the end, then renames and sets fade and note in place', () => {
    const added = applied(applied(emptyShow(), { type: 'putHousePreset', preset: dim }), {
      type: 'putHousePreset',
      preset: up,
    });
    expect(added.housePresets).toEqual([dim, up]);

    const edited = applied(added, {
      type: 'putHousePreset',
      preset: { ...dim, name: 'Show dim', fade: 0.5, note: { channel: 1, note: 0 } },
    });
    expect(edited.housePresets).toEqual([
      { id: 'dim', name: 'Show dim', fade: 0.5, note: { channel: 1, note: 0 } },
      up,
    ]);
    expect(
      applied(edited, { type: 'putHousePreset', preset: { ...up, note: undefined } })
        .housePresets?.[1],
    ).toEqual({ id: 'up', name: 'Up', fade: 5 });
  });

  it('reorders House Presets', () => {
    const last: HousePreset = { id: 'last', name: 'Last', fade: 0 };
    const before = withPresets(dim, up, last);

    expect(applied(before, { type: 'moveHousePreset', id: 'last', to: 0 }).housePresets).toEqual([
      last,
      dim,
      up,
    ]);
    expect(applied(before, { type: 'moveHousePreset', id: 'dim', to: 2 }).housePresets).toEqual([
      up,
      last,
      dim,
    ]);
  });

  it('removes a House Preset, leaving the Show without the list when it was the last', () => {
    expect(applyShowEdit(withPresets(dim, up), { type: 'removeHousePreset', id: 'dim' })).toEqual({
      show: withPresets(up),
    });
    expect(applyShowEdit(withPresets(dim), { type: 'removeHousePreset', id: 'dim' })).toEqual({
      show: emptyShow(),
    });
  });

  it('refuses to move or remove a House Preset that is not in the Show', () => {
    const errors = ['House Preset id "nope" is not in the Show'];

    expect(applyShowEdit(withPresets(dim), { type: 'moveHousePreset', id: 'nope', to: 0 })).toEqual(
      { errors },
    );
    expect(applyShowEdit(withPresets(dim), { type: 'removeHousePreset', id: 'nope' })).toEqual({
      errors,
    });
  });

  it('holds at most eight House Presets', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, fade: 0 }));

    expect(validateShow(withPresets(...eight))).toEqual([]);
    expect(put(withPresets(...eight), dim)).toEqual({ errors: ['House Presets: at most 8'] });
  });

  it("rejects a note that is another House Preset's", () => {
    expect(put(withPresets(up), { ...dim, note: { channel: 2, note: 10 } })).toEqual({
      errors: ['House Preset note 2/10 is used twice'],
    });
  });

  it("rejects a House Preset on a Trigger's note, and a Trigger on a House Preset's", () => {
    const withTrigger: Show = {
      ...emptyShow(),
      scenes: [scene({ id: 'verse', layer: 'layer-1' })],
      triggers: [{ channel: 1, note: 60, scene: 'verse', mode: 'go' }],
    };
    const clash = { ...dim, note: { channel: 1, note: 60 } };

    expect(put(withTrigger, clash)).toEqual({
      errors: ['House Preset "Dim": note 1/60 is also a Trigger'],
    });
    expect(
      applyShowEdit(
        { ...withTrigger, triggers: [], housePresets: [clash] },
        { type: 'putTrigger', trigger: withTrigger.triggers[0]! },
      ),
    ).toEqual({ errors: ['House Preset "Dim": note 1/60 is also a Trigger'] });
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

  const put = (show: Show, preset: HazePreset) =>
    applyShowEdit(show, { type: 'putHazePreset', preset });

  it('adds Haze Presets at the end, then edits them in place', () => {
    const added = applied(applied(emptyShow(), { type: 'putHazePreset', preset: light }), {
      type: 'putHazePreset',
      preset: heavy,
    });
    expect(added.hazePresets).toEqual([light, heavy]);

    const mist = { ...light, name: 'Mist', level: 0.1, fade: 0 };
    expect(applied(added, { type: 'putHazePreset', preset: mist }).hazePresets).toEqual([
      mist,
      heavy,
    ]);
  });

  it('reorders Haze Presets', () => {
    const last: HazePreset = { id: 'last', name: 'Last', level: 0, fade: 0 };
    const before = withPresets(light, heavy, last);

    expect(applied(before, { type: 'moveHazePreset', id: 'last', to: 0 }).hazePresets).toEqual([
      last,
      light,
      heavy,
    ]);
    expect(applied(before, { type: 'moveHazePreset', id: 'light', to: 2 }).hazePresets).toEqual([
      heavy,
      last,
      light,
    ]);
  });

  it('removes a Haze Preset, leaving the Show without the list when it was the last', () => {
    expect(
      applyShowEdit(withPresets(light, heavy), { type: 'removeHazePreset', id: 'light' }),
    ).toEqual({ show: withPresets(heavy) });
    expect(applyShowEdit(withPresets(light), { type: 'removeHazePreset', id: 'light' })).toEqual({
      show: emptyShow(),
    });
  });

  it('refuses to move or remove a Haze Preset that is not in the Show', () => {
    const errors = ['Haze Preset id "nope" is not in the Show'];

    expect(
      applyShowEdit(withPresets(light), { type: 'moveHazePreset', id: 'nope', to: 0 }),
    ).toEqual({ errors });
    expect(applyShowEdit(withPresets(light), { type: 'removeHazePreset', id: 'nope' })).toEqual({
      errors,
    });
  });

  it('holds at most eight Haze Presets', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      level: 0.5,
      fade: 0,
    }));

    expect(validateShow(withPresets(...eight))).toEqual([]);
    expect(put(withPresets(...eight), light)).toEqual({ errors: ['Haze Presets: at most 8'] });
  });

  it("rejects a note that is another Haze Preset's", () => {
    expect(put(withPresets(heavy), { ...light, note: { channel: 2, note: 20 } })).toEqual({
      errors: ['Haze Preset note 2/20 is used twice'],
    });
  });

  it("rejects a Haze Preset on a Trigger's note or a House Preset's, and the reverse", () => {
    const withTrigger: Show = {
      ...emptyShow(),
      scenes: [scene({ id: 'verse', layer: 'layer-1' })],
      triggers: [{ channel: 1, note: 60, scene: 'verse', mode: 'go' }],
    };
    const onTrigger = { ...light, note: { channel: 1, note: 60 } };
    expect(put(withTrigger, onTrigger)).toEqual({
      errors: ['Haze Preset "Light": note 1/60 is also a Trigger'],
    });
    expect(
      applyShowEdit(
        { ...withTrigger, triggers: [], hazePresets: [onTrigger] },
        { type: 'putTrigger', trigger: withTrigger.triggers[0]! },
      ),
    ).toEqual({ errors: ['Haze Preset "Light": note 1/60 is also a Trigger'] });

    const house: HousePreset = { id: 'dim', name: 'Dim', fade: 0, note: { channel: 3, note: 5 } };
    const onHouse = { ...light, note: { channel: 3, note: 5 } };
    expect(put({ ...emptyShow(), housePresets: [house] }, onHouse)).toEqual({
      errors: ['Haze Preset "Light": note 3/5 is also a House Preset'],
    });
    expect(
      applyShowEdit(
        { ...emptyShow(), hazePresets: [onHouse] },
        { type: 'putHousePreset', preset: house },
      ),
    ).toEqual({ errors: ['Haze Preset "Light": note 3/5 is also a House Preset'] });
  });
});
