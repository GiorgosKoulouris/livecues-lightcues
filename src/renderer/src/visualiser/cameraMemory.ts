import type { StageBounds } from '../../../shared/venue-patch';
import type { CameraPose } from './sceneModel';

// The free camera, kept while the app runs so the Visualiser comes back to
// where it was left. Never saved to disk. It belongs to the stage bounds it
// was set under: other bounds, such as another Venue Patch's, forget it, so
// that Venue Patch opens on its own FOH.
let free: { pose: CameraPose; stage: StageBounds } | undefined;

export const sameStage = (a: StageBounds, b: StageBounds) =>
  a.width === b.width && a.depth === b.depth;

export function rememberedCamera(stage: StageBounds): CameraPose | undefined {
  return free && sameStage(free.stage, stage) ? free.pose : undefined;
}

export function rememberCamera(pose: CameraPose, stage: StageBounds): void {
  free = { pose, stage };
}

// Forgets the camera, whatever the bounds.
export function forgetCamera(): void {
  free = undefined;
}
