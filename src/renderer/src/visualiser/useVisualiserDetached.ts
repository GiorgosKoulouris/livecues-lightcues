import { useEffect, useState } from 'react';
import { takeHandover } from './handover';

// Whether the Visualiser is in its own window (ADR 0022), asked of main on
// mount and then told as it changes. Starts attached. On reattach it takes the
// Detached Visualiser's camera and haze override from main first, so the View
// that replaces the placeholder opens on them. Only the latest answer counts:
// any event supersedes the first isDetached answer and the events before it.
export function useVisualiserDetached(): boolean {
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    let live = true;
    let latest = 0;
    const current = (token: number) => live && token === latest;
    const off = window.visualiserWindow.onDetached((now) => {
      const token = ++latest;
      if (now) return setDetached(true);
      void takeHandover(() => !current(token)).then((taken) => taken && setDetached(false));
    });
    const asked = latest;
    // A failed question counts as attached.
    void window.visualiserWindow
      .isDetached()
      .catch(() => false)
      .then((now) => current(asked) && setDetached(now));
    return () => {
      live = false;
      off();
    };
  }, []);

  return detached;
}
