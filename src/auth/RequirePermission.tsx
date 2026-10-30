import type { ReactNode } from 'react';
import { useCan, type Permission } from './permissions';

/** Props for {@link RequirePermission}. */
export interface RequirePermissionProps {
  /** The permission the signed-in principal must hold. */
  permission: Permission;
  /** Rendered when the principal holds the permission. */
  children: ReactNode;
  /** Rendered otherwise; defaults to nothing (the gated action is simply absent). */
  fallback?: ReactNode;
}

/**
 * Renders `children` only when the signed-in principal holds `permission`, else `fallback`
 * (nothing by default). Use it to hide or replace a client **action** a user's permissions do not
 * cover; open-read views stay reachable regardless.
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const can = useCan();
  return <>{can(permission) ? children : fallback}</>;
}
