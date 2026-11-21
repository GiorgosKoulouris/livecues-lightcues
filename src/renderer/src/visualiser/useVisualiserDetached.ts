import { useEffect, useState } from 'react';

// Whether the Visualiser is in its own window (ADR 0022), asked of main on
// mount and then told as it changes. Starts attached.
export function useVisualiserDetached(): boolean {
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    let live = true;
    const off = window.visualiserWindow.onDetached(setDetached);
    void window.visualiserWindow.isDetached().then((now) => live && setDetached(now));
    return () => {
      live = false;
      off();
    };
  }, []);

  return detached;
}
