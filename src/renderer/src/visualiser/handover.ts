import type { VisualiserHandover } from '../../../shared/visualiser-handover';
import { forgetCamera, rememberCamera } from './cameraMemory';

// The haze override a Visualiser starts with: what the other window handed
// over, until the Visualiser that took it unmounts. View-only, never saved.
// Absent is a cleared override.
let haze: number | undefined;

export const handedOverHaze = (): number | undefined => haze;

// The Visualiser keeps this to its own override while it shows, so that it
// starts from nothing the next time.
export function setHandedOverHaze(value: number | undefined): void {
  haze = value;
}

// This window's Visualiser takes over the other's camera and override. The
// camera goes to the free camera memory, which the Visualiser opens on.
export function acceptHandover(handover: VisualiserHandover | undefined): void {
  if (!handover) return;
  // No camera means the other window had no free camera: open on the default.
  if (handover.camera) rememberCamera(handover.camera.pose, handover.camera.stage);
  else forgetCamera();
  haze = handover.haze;
}

// Asks main for the other window's camera and override, then accepts them
// unless `stale()` says the answer came too late. A read that fails hands
// nothing over: the Visualiser carries on with defaults. Resolves to whether
// the answer is still wanted.
export async function takeHandover(stale: () => boolean): Promise<boolean> {
  const state = await window.visualiserWindow.getState().catch(() => undefined);
  if (stale()) return false;
  acceptHandover(state);
  return true;
}
