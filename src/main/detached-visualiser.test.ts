import { describe, expect, it } from 'vitest';
import { centredBounds, createDetachedVisualiser } from './detached-visualiser';

function setup() {
  const log: string[] = [];
  let opened = 0;
  const closers = new Map<string, () => void>();
  const detached = createDetachedVisualiser<string>({
    open: (onClosed) => {
      const window = `w${++opened}`;
      closers.set(window, onClosed);
      log.push(`open ${window}`);
      return window;
    },
    focus: (window) => void log.push(`focus ${window}`),
    close: (window) => {
      log.push(`close ${window}`);
      closers.get(window)?.();
    },
    changed: (isDetached) => void log.push(`changed ${isDetached}`),
  });
  return { detached, log, closers };
}

describe('createDetachedVisualiser', () => {
  it('starts attached', () => {
    expect(setup().detached.isDetached()).toBe(false);
  });

  it('opens one window on detach and says so', () => {
    const { detached, log } = setup();
    detached.detach();
    expect(detached.isDetached()).toBe(true);
    expect(log).toEqual(['open w1', 'changed true']);
  });

  it('focuses the window on a second detach, and opens no other', () => {
    const { detached, log } = setup();
    detached.detach();
    detached.detach();
    expect(log).toEqual(['open w1', 'changed true', 'focus w1']);
  });

  it('reattach closes the window, and the close says it is attached', () => {
    const { detached, log } = setup();
    detached.detach();
    detached.reattach();
    expect(detached.isDetached()).toBe(false);
    expect(log.slice(2)).toEqual(['close w1', 'changed false']);
  });

  it('a window closed by the user reattaches', () => {
    const { detached, log, closers } = setup();
    detached.detach();
    closers.get('w1')?.();
    expect(detached.isDetached()).toBe(false);
    expect(log.slice(2)).toEqual(['changed false']);
  });

  it('reattach while attached does nothing', () => {
    const { detached, log } = setup();
    detached.reattach();
    expect(log).toEqual([]);
  });

  it('can detach again after a reattach', () => {
    const { detached, log } = setup();
    detached.detach();
    detached.reattach();
    detached.detach();
    expect(log.at(-2)).toBe('open w2');
  });
});

describe('centredBounds', () => {
  it('centres the size in the work area', () => {
    expect(
      centredBounds({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 960, height: 600 }),
    ).toEqual({
      x: 480,
      y: 240,
      width: 960,
      height: 600,
    });
  });

  it('follows a display that is not at the origin', () => {
    expect(
      centredBounds({ x: 1920, y: 100, width: 1000, height: 800 }, { width: 600, height: 400 }),
    ).toEqual({ x: 2120, y: 300, width: 600, height: 400 });
  });

  it('shrinks to a work area that is smaller than the window', () => {
    expect(
      centredBounds({ x: 0, y: 0, width: 500, height: 300 }, { width: 960, height: 600 }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 300,
    });
  });
});
