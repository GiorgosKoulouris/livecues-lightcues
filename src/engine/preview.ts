import type { EngineEvent, FixtureLight, HouseAmbient } from '../shared/protocol';

// ~40 Hz, the Outputs' frame rate.
const PREVIEW_INTERVAL_MS = 25;

interface PreviewOptions {
  emit: (event: EngineEvent) => void;
  // How every Fixture looks now, by Fixture id.
  lights: () => Record<string, FixtureLight>;
  // The haze level (0–1) the Hazers follow now, mid-fade too.
  haze: () => number;
  // The House Lights' ambient now, mid-fade too; none with no House Lights.
  house: () => HouseAmbient | undefined;
}

// While started, sends how the Fixtures look, the haze and the house ambient, whenever either changes. It runs on
// its own timer and only reads the resolved state, so it never holds up or
// changes the frames sent to the Outputs.
export function createPreview({ emit, lights, haze, house }: PreviewOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastEmitted = '';

  function emitLights({ always }: { always: boolean }): void {
    const current = lights();
    const level = haze();
    const ambient = house();
    // A haze or house change is a preview change.
    const json = JSON.stringify([current, level, ambient]);
    if (json === lastEmitted && !always) return;
    lastEmitted = json;
    emit({ type: 'preview', lights: current, haze: level, ...(ambient ? { house: ambient } : {}) });
  }

  return {
    // Sends the current lights at once, even if unchanged, e.g. to a reloaded
    // UI.
    start(): void {
      emitLights({ always: true });
      timer ??= setInterval(() => emitLights({ always: false }), PREVIEW_INTERVAL_MS);
    },
    stop(): void {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
