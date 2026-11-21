import { useEffect } from 'react';
import { DETACHED_VISUALISER_TITLE } from '../../../shared/protocol';
import { useVenuePatch } from '../venue/useVenuePatch';
import { VisualiserView } from './VisualiserView';
import styles from './VisualiserView.module.css';

// The page of the Detached Visualiser's window: only the Visualiser, live,
// with a Reattach button in its toolbar. It stays read-only.
export function DetachedVisualiser() {
  const { venue } = useVenuePatch();
  // The page's title is the window's.
  useEffect(() => void (document.title = DETACHED_VISUALISER_TITLE), []);
  return (
    <div className={styles.page}>
      <VisualiserView
        patch={venue?.patch}
        windowButton={{ label: 'Reattach', onClick: () => window.visualiserWindow.reattach() }}
      />
    </div>
  );
}
