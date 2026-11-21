import { useEngineDown } from '../shell/useEngineDown';
import { WarnPanel } from '../ui/WarnPanel';
import styles from './EngineDownNotice.module.css';

// Shown while the engine is down for good. It has no save controls: saving
// and recovery stay in the main window.
export function EngineDownNotice() {
  if (!useEngineDown()) return null;
  return (
    <WarnPanel className={styles.notice}>
      <span>The engine keeps crashing. Save your work in the main window.</span>
    </WarnPanel>
  );
}
