import { Button } from '../ui/Button';
import styles from './VisualiserView.module.css';

// Stands in for the Visualiser View while the Visualiser is detached, so only
// one renders.
export function DetachedPlaceholder() {
  return (
    <div className={styles.placeholder}>
      <p>The Visualiser is in its own window.</p>
      <Button onClick={() => window.visualiserWindow.reattach()}>Reattach</Button>
    </div>
  );
}
