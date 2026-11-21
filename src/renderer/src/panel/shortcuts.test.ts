import { describe, expect, it } from 'vitest';
import { isTextEntry, panelAction, type KeyPress } from './shortcuts';

const press = (key: string, more: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code: /^\d$/.test(key) ? `Digit${key}` : '',
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...more,
});

describe('panelAction', () => {
  it('maps B to Blackout and 0 to the Base Look', () => {
    expect(panelAction(press('b'))).toEqual({ type: 'blackout' });
    expect(panelAction(press('B'))).toEqual({ type: 'blackout' });
    expect(panelAction(press('0'))).toEqual({ type: 'baseLook' });
  });

  it('has no action for the digits 1–9, with or without Shift', () => {
    for (const digit of '123456789') {
      expect(panelAction(press(digit))).toBeUndefined();
      expect(panelAction(press('!', { code: `Digit${digit}`, shiftKey: true }))).toBeUndefined();
    }
  });

  it('keeps Shift for keys typed with it: Blackout and the Grand Master', () => {
    expect(panelAction(press('B', { shiftKey: true }))).toEqual({ type: 'blackout' });
    expect(panelAction(press('+', { code: 'Equal', shiftKey: true }))).toEqual({
      type: 'grandMaster',
      step: 0.1,
    });
  });

  it('maps T to Tap Tempo, not while held', () => {
    expect(panelAction(press('t'))).toEqual({ type: 'tapTempo' });
    expect(panelAction(press('T'))).toEqual({ type: 'tapTempo' });
    expect(panelAction(press('t', { repeat: true }))).toBeUndefined();
  });

  it('maps F to Freeze, not while held', () => {
    expect(panelAction(press('f'))).toEqual({ type: 'freeze' });
    expect(panelAction(press('F'))).toEqual({ type: 'freeze' });
    expect(panelAction(press('f', { repeat: true }))).toBeUndefined();
  });

  it('steps the Grand Master down with - and up with = or +, also while held', () => {
    expect(panelAction(press('-'))).toEqual({ type: 'grandMaster', step: -0.1 });
    expect(panelAction(press('='))).toEqual({ type: 'grandMaster', step: 0.1 });
    expect(panelAction(press('+', { repeat: true }))).toEqual({ type: 'grandMaster', step: 0.1 });
  });

  it('ignores other keys, held keys that toggle or go, and keys with Ctrl, Alt or Meta', () => {
    expect(panelAction(press('a'))).toBeUndefined();
    expect(panelAction(press('Enter'))).toBeUndefined();
    expect(panelAction(press('b', { repeat: true }))).toBeUndefined();
    expect(panelAction(press('1', { repeat: true }))).toBeUndefined();
    expect(panelAction(press('1', { ctrlKey: true }))).toBeUndefined();
    expect(panelAction(press('b', { altKey: true }))).toBeUndefined();
    expect(panelAction(press('-', { metaKey: true }))).toBeUndefined();
  });
});

describe('isTextEntry', () => {
  it('is true for text fields, text areas and editable content', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for buttons, sliders, check boxes, lists and the page', () => {
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(false);
    expect(isTextEntry({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
