import styles from './Spinner.module.css';

/** A small loading indicator with an accessible label. */
export function Spinner({ size = 16, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={styles.spinner}
      style={{ width: size, height: size }}
    />
  );
}
