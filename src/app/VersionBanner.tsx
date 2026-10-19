import { useCapabilities, type CapabilitiesStore } from '../state/capabilities';

/**
 * Warns when the live backend's API version differs from the spec this client was built from.
 * Renders nothing until capabilities load, or when the versions agree.
 */
export function VersionBanner({ store }: { store: CapabilitiesStore }) {
  const capabilities = useCapabilities(store);
  if (capabilities.status !== 'ready' || !capabilities.version.mismatch) {
    return null;
  }
  const { expected, actual } = capabilities.version;
  return (
    <p role="alert" data-testid="version-mismatch">
      This client was built for API version {expected}, but the backend reports{' '}
      {actual ?? 'no version'}. Some features may not work until the client is rebuilt against the
      current spec.
    </p>
  );
}
