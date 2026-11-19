import { describe, expect, it } from 'vitest';
import {
  editProblem,
  findListedOn,
  listProblems,
  moveListed,
  presetProblems,
  putListed,
  removeListed,
  type ListedPreset,
} from './preset-list';

const p = (id: string, note?: ListedPreset['note']): ListedPreset => ({ id, name: id, note });
const ids = (list: ListedPreset[]) => list.map((x) => x.id);

describe('Preset lists', () => {
  it('puts at the end, or in place by id', () => {
    const list = [p('a'), p('b')];

    expect(ids(putListed(list, p('c')))).toEqual(['a', 'b', 'c']);
    expect(putListed(list, { ...p('a'), name: 'New' })[0]!.name).toBe('New');
    expect(ids(putListed(list, p('a')))).toEqual(['a', 'b']);
  });

  it('moves to an index and leaves a list without the id as it is', () => {
    const list = [p('a'), p('b'), p('c')];

    expect(ids(moveListed(list, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(moveListed(list, 'x', 0)).toBe(list);
  });

  it('removes by id', () => {
    expect(ids(removeListed([p('a'), p('b')], 'a'))).toEqual(['b']);
  });

  it('finds by note', () => {
    const list = [p('a'), p('b', { channel: 1, note: 60 })];

    expect(findListedOn(list, { channel: 1, note: 60 })?.id).toBe('b');
    expect(findListedOn(list, { channel: 2, note: 60 })).toBeUndefined();
  });

  it('says why a move or remove cannot be done', () => {
    const list = [p('a'), p('b')];

    expect(editProblem('Haze Preset', list, 'x')).toBe('Haze Preset id "x" is not in the Show');
    expect(editProblem('Haze Preset', list, 'a', 2)).toBe(
      'Haze Preset position 2 is not in the list',
    );
    expect(editProblem('Haze Preset', list, 'a', 1)).toBeUndefined();
    expect(editProblem('Haze Preset', list, 'a')).toBeUndefined();
  });

  it('checks ids, names, repeats and the cap', () => {
    expect(presetProblems({ id: '', name: ' ' }, 'X: ')).toEqual([
      'X: id is missing',
      'X: name is empty',
    ]);
    const note = { channel: 1, note: 60 };
    expect(listProblems('Haze Preset', [p('a', note), p('a', note), p('b')], 2)).toEqual([
      'Haze Preset id "a" is used twice',
      'Haze Preset note 1/60 is used twice',
      'Haze Presets: at most 2',
    ]);
  });
});
