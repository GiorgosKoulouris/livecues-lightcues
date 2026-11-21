import { useEffect, useState } from 'react';

// Whether the engine is down for good. It stays true once set: main does not
// bring the engine back after that.
export function useEngineDown(): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let live = true;
    void window.engineRecovery.isDown().then((isDown) => live && isDown && setDown(true));
    const off = window.engineRecovery.onDown(() => setDown(true));
    return () => {
      live = false;
      off();
    };
  }, []);
  return down;
}
