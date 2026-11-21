import { useEffect, useState } from 'react';
import styles from './EngineDownNotice.module.css';

// Shown while the engine is down for good. It has no save controls: saving
// and recovery stay in the main window.
export function EngineDownNotice() {
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
  if (!down) return null;
  return (
    <div role="alert" className={styles.notice}>
      <span className={styles.mark} aria-hidden />
      <span>The engine keeps crashing. Save your work in the main window.</span>
    </div>
  );
}
