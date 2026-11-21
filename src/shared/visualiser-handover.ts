// What the Visualiser hands over when it moves between the main window and the
// Detached Visualiser (ADR 0022): the free camera and the haze override. Both
// are view-only. The override is for drawing and is never sent to a Hazer.
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface VisualiserHandover {
  // The free camera, with the stage bounds it was set under.
  camera?: {
    pose: { position: Vec3; target: Vec3 };
    stage: { width: number; depth: number };
  };
  // The haze override, 0..1. Absent means cleared: the Hazers' haze is drawn.
  haze?: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function parseVec3(value: unknown): Vec3 | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, z } = value;
  return isNumber(x) && isNumber(y) && isNumber(z) ? { x, y, z } : undefined;
}

// What a renderer sent, checked and copied, or undefined when it is malformed.
export function parseHandover(value: unknown): VisualiserHandover | undefined {
  if (!isRecord(value)) return undefined;
  const result: VisualiserHandover = {};
  const { camera, haze } = value;
  if (haze !== undefined) {
    if (!isNumber(haze) || haze < 0 || haze > 1) return undefined;
    result.haze = haze;
  }
  if (camera !== undefined) {
    if (!isRecord(camera) || !isRecord(camera['pose']) || !isRecord(camera['stage'])) {
      return undefined;
    }
    const position = parseVec3(camera['pose']['position']);
    const target = parseVec3(camera['pose']['target']);
    const { width, depth } = camera['stage'];
    if (!position || !target || !isNumber(width) || !isNumber(depth)) return undefined;
    if (width <= 0 || depth <= 0) return undefined;
    result.camera = { pose: { position, target }, stage: { width, depth } };
  }
  return result;
}
