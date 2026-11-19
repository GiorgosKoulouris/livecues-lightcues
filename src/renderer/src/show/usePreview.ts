import { useEffect, useState } from 'react';
import type { FixtureLight, HouseAmbient } from '../../../shared/protocol';

// The Previews mounted now. The engine has one preview stream, so the last
// to unsubscribe stops it.
let mounted = 0;

// Calls `onLights` with how each Fixture looks, by Fixture id, and the haze
// level (0–1) and the House Lights' ambient (none with no House Lights), on every `preview` event, until the returned function is called. The engine sends
// events only while something is subscribed.
export function subscribePreview(
  onLights: (
    lights: Record<string, FixtureLight>,
    haze: number,
    house: HouseAmbient | undefined,
  ) => void,
) {
  const unsubscribe = window.engine.onEvent((event) => {
    if (event.type === 'preview') onLights(event.lights, event.haze, event.house);
  });
  // Sent by each, so each gets the current lights at once.
  mounted++;
  window.engine.send({ type: 'startPreview' });
  return () => {
    mounted--;
    if (mounted === 0) window.engine.send({ type: 'stopPreview' });
    unsubscribe();
  };
}

// How each Fixture looks now, by Fixture id, kept in step through engine
// events.
export function usePreview(): Record<string, FixtureLight> {
  const [lights, setLights] = useState<Record<string, FixtureLight>>({});
  useEffect(() => subscribePreview((next) => setLights(next)), []);
  return lights;
}
