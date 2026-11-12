import { cx } from '../ui/cx';
import styles from './ActiveDot.module.css';

// Marks an active Scene wherever it is listed: an LED Green disc, or a
// triangle (`shape`) where the list uses the family's active-row language. The
// drawn shape carries the state, not the colour. Takes its space when off, so
// names line up.
export function ActiveDot({ on, shape = 'disc' }: { on: boolean; shape?: 'disc' | 'triangle' }) {
  return on ? (
    <span
      role="img"
      aria-label="active"
      className={cx(styles.dot, shape === 'triangle' && styles.triangle)}
    />
  ) : (
    <span aria-hidden className={styles.off} />
  );
}
