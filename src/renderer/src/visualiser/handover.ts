import type { VisualiserHandover } from '../../../shared/visualiser-handover';
import { rememberCamera } from './cameraMemory';

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
  if (handover.camera) rememberCamera(handover.camera.pose, handover.camera.stage);
  haze = handover.haze;
}
