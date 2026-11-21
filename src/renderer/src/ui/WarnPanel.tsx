import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './WarnPanel.module.css';

// A Display panel with a Warn Amber edge, led by a drawn triangle: it reports
// a problem. It floats centred over the page; `className` places it.
export function WarnPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="alert" className={cx(styles.panel, className)}>
      <span className={styles.mark} aria-hidden />
      {children}
    </div>
  );
}
