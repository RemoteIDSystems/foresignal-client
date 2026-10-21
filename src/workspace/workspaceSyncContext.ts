import { createContext, useContext } from 'react';
import type { WorkspaceSync } from './WorkspaceSync';

/** The session's workspace binding, for the panels that add to it or open it (025). */
export const WorkspaceSyncContext = createContext<WorkspaceSync | undefined>(undefined);

/** The session's workspace binding; undefined outside the app shell (in a panel's own tests). */
export function useWorkspaceSync(): WorkspaceSync | undefined {
  return useContext(WorkspaceSyncContext);
}
