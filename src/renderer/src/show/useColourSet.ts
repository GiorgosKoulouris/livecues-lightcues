import { useEffect, useState } from 'react';
import type { HeldColourSet } from '../../../shared/protocol';

// The Colour Set the slot colours follow, kept in step through engine events.
export function useColourSet(): HeldColourSet | undefined {
  const [held, setHeld] = useState<HeldColourSet>();

  useEffect(() => {
    const unsubscribe = window.engine.onEvent((event) => {
      if (event.type === 'colourSet') setHeld(event.held);
    });
    window.engine.send({ type: 'getColourSet' });
    return unsubscribe;
  }, []);

  return held;
}
