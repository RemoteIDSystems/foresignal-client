import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

/** Visual weight of a {@link Button}. */
export type ButtonVariant = 'default' | 'primary' | 'ghost';

/** Props for {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight; `default` is the bordered panel button from the mockups. */
  variant?: ButtonVariant;
  /** Optional leading icon. */
  icon?: ReactNode;
}

/** A compact text button in the dashboard style. Defaults to `type="button"`. */
export function Button({ variant = 'default', icon, className, children, ...rest }: ButtonProps) {
  const classes = [styles.button, variant !== 'default' && styles[variant], className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** Props for {@link IconButton}. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  /** The icon to show. */
  icon: ReactNode;
  /** `ghost` (default) has no chrome until hovered; `bordered` matches {@link Button}. */
  variant?: 'ghost' | 'bordered';
}

/** A square icon-only button with an accessible name. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  ...rest
}: IconButtonProps) {
  const classes = [styles.button, styles.icon, variant === 'ghost' && styles.iconGhost, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" aria-label={label} title={label} className={classes} {...rest}>
      {icon}
    </button>
  );
}
