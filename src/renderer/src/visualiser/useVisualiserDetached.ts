import { useEffect, useState } from 'react';
import { acceptHandover } from './handover';

// Whether the Visualiser is in its own window (ADR 0022), asked of main on
// mount and then told as it changes. Starts attached. On reattach it takes the
// Detached Visualiser's camera and haze override from main first, so the View
// that replaces the placeholder opens on them.
export function useVisualiserDetached(): boolean {
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    let live = true;
    const off = window.visualiserWindow.onDetached((now) => {
      if (now) return setDetached(true);
      void window.visualiserWindow.getState().then((state) => {
        if (!live) return;
        acceptHandover(state);
        setDetached(false);
      });
    });
    void window.visualiserWindow.isDetached().then((now) => live && setDetached(now));
    return () => {
      live = false;
      off();
    };
  }, []);

  return detached;
}
