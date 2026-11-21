import { useEffect, useState } from 'react';
import { usePanelKeys } from '../panel/usePanelKeys';
import { usePlayback } from '../show/usePlayback';
import { useShow } from '../show/useShow';
import { DETACHED_VISUALISER_TITLE } from '../../../shared/protocol';
import { useVenuePatch } from '../venue/useVenuePatch';
import { EngineDownNotice } from './EngineDownNotice';
import { takeHandover } from './handover';
import { VisualiserView } from './VisualiserView';
import styles from './VisualiserView.module.css';

// Whether the window is shown: not minimized or fully hidden.
function useShown(): boolean {
  const [shown, setShown] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const change = () => setShown(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return shown;
}

// The page of the Detached Visualiser's window: only the Visualiser, live,
// with a Reattach button in its toolbar. It stays read-only, apart from the
// Fallback Panel keys. While the window is minimized or hidden it leaves the
// preview feed and draws nothing.
export function DetachedVisualiser() {
  const { venue } = useVenuePatch();
  const playback = usePlayback();
  const shown = useShown();
  // The Fallback Panel keys, and only those, work while this window has focus.
  usePanelKeys(useShow().show?.show, playback);
  // The page's title is the window's.
  useEffect(() => void (document.title = DETACHED_VISUALISER_TITLE), []);
  // It opens with the camera and haze override the View had.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void takeHandover(() => !live).then((taken) => taken && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={styles.page}>
      {ready && (
        <VisualiserView
          patch={venue?.patch}
          blind={playback?.mode === 'blind'}
          paused={!shown}
          windowButton={{ label: 'Reattach', onClick: () => window.visualiserWindow.reattach() }}
        />
      )}
      <EngineDownNotice />
    </div>
  );
}
