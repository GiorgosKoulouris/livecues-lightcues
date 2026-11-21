import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetCamera, rememberCamera, rememberedCamera } from './cameraMemory';
import { acceptHandover, handedOverHaze, setHandedOverHaze } from './handover';

const stage = { width: 10, depth: 6 };
const pose = { position: { x: 1, y: -2, z: 3 }, target: { x: 0, y: 1, z: 0 } };

beforeEach(() => {
  forgetCamera();
  setHandedOverHaze(undefined);
});

afterEach(() => forgetCamera());

describe('acceptHandover', () => {
  it('takes the free camera and the haze override', () => {
    acceptHandover({ camera: { pose, stage }, haze: 0.3 });
    expect(rememberedCamera(stage)).toEqual(pose);
    expect(handedOverHaze()).toBe(0.3);
  });

  it('forgets its own free camera when the other window had none', () => {
    rememberCamera(pose, stage);
    acceptHandover({ haze: 0.3 });
    expect(rememberedCamera(stage)).toBeUndefined();
  });

  it('changes nothing when main holds no hand-over', () => {
    rememberCamera(pose, stage);
    acceptHandover(undefined);
    expect(rememberedCamera(stage)).toEqual(pose);
  });
});
