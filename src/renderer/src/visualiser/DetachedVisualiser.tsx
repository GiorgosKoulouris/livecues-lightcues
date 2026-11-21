import { useEffect, useState } from 'react';
import { DETACHED_VISUALISER_TITLE } from '../../../shared/protocol';
import { useVenuePatch } from '../venue/useVenuePatch';
import { acceptHandover } from './handover';
import { VisualiserView } from './VisualiserView';
import styles from './VisualiserView.module.css';

// The page of the Detached Visualiser's window: only the Visualiser, live,
// with a Reattach button in its toolbar. It stays read-only.
export function DetachedVisualiser() {
  const { venue } = useVenuePatch();
  // The page's title is the window's.
  useEffect(() => void (document.title = DETACHED_VISUALISER_TITLE), []);
  // It opens with the camera and haze override the View had.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void window.visualiserWindow.getState().then((state) => {
      if (!live) return;
      acceptHandover(state);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={styles.page}>
      {ready && (
        <VisualiserView
          patch={venue?.patch}
          windowButton={{ label: 'Reattach', onClick: () => window.visualiserWindow.reattach() }}
        />
      )}
    </div>
  );
}
