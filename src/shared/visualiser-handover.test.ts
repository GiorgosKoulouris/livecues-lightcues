import { describe, expect, it } from 'vitest';
import { parseHandover } from './visualiser-handover';

const camera = {
  pose: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
  stage: { width: 10, depth: 6 },
};

describe('parseHandover', () => {
  it('keeps a camera and a haze override', () => {
    expect(parseHandover({ camera, haze: 0.4 })).toEqual({ camera, haze: 0.4 });
  });

  it('keeps a cleared override cleared', () => {
    expect(parseHandover({ camera, haze: undefined })).toEqual({ camera });
  });

  it('copies only the known fields', () => {
    expect(parseHandover({ haze: 0.1, extra: 1 })).toEqual({ haze: 0.1 });
  });

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['haze out of range', { haze: 2 }],
    ['haze not a number', { haze: 'a' }],
    ['haze NaN', { haze: NaN }],
    ['camera without a pose', { camera: { stage: camera.stage } }],
    ['camera with a bad point', { camera: { ...camera, pose: { position: 1, target: 2 } } }],
    [
      'camera with a NaN point',
      { camera: { ...camera, pose: { ...camera.pose, target: { x: NaN, y: 0, z: 0 } } } },
    ],
    ['camera with a bad stage', { camera: { ...camera, stage: { width: 'a', depth: 1 } } }],
    ['camera with a zero stage width', { camera: { ...camera, stage: { width: 0, depth: 6 } } }],
    [
      'camera with a negative stage depth',
      { camera: { ...camera, stage: { width: 10, depth: -1 } } },
    ],
  ])('rejects %s', (_name, value) => {
    expect(parseHandover(value)).toBeUndefined();
  });
});
