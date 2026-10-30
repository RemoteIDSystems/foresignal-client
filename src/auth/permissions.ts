import { usePermissions } from '../api/useMe';

/**
 * The **end-user** permission keys this presentation client gates on. The operator permissions
 * (`users.manage`, `roles.manage`, `system.settings`, `storage.manage`, `network.manage`,
 * `collection.manage`, `collector.settings`, `llm.shared.manage`) gate `foresignal-admin`, not this
 * client, and deliberately have no UI here.
 */
export const END_USER_PERMISSIONS = [
  'data.read',
  'intel.read',
  'self.preferences',
  'self.sources',
  'self.alerts',
  'self.llm',
] as const;

/** One of the client's gated permission keys. */
export type Permission = (typeof END_USER_PERMISSIONS)[number];

/** True when `permissions` (the principal's effective keys) grants `permission`. */
export function can(permissions: readonly string[], permission: Permission): boolean {
  return permissions.includes(permission);
}

/**
 * A predicate over the signed-in principal's effective permissions, re-rendering when they change.
 * A signed-out visitor has no permissions, so every check is `false` and only open-read views remain
 * (views are never gated on these keys — only actions are).
 *
 * ```tsx
 * const can = useCan();
 * can('self.alerts'); // may this user change alerts?
 * ```
 */
export function useCan(): (permission: Permission) => boolean {
  const permissions = usePermissions();
  return (permission) => can(permissions, permission);
}
