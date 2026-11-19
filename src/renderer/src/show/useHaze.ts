import { useEffect, useState } from 'react';
import type { HazeFired } from '../../../shared/protocol';

// What the Hazers went to last, kept in step through engine events.
export function useHaze(): HazeFired | undefined {
  const [fired, setFired] = useState<HazeFired>();

  useEffect(() => {
    const unsubscribe = window.engine.onEvent((event) => {
      if (event.type === 'haze') setFired(event.fired);
    });
    window.engine.send({ type: 'getHaze' });
    return unsubscribe;
  }, []);

  return fired;
}
