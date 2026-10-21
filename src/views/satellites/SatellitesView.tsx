import { lazy, Suspense } from 'react';
import type { SatellitesScreenProps } from './SatellitesScreen';

const SatellitesScreen = lazy(() => import('./SatellitesScreen'));

/**
 * The Satellite Operations screen (027), loaded with its orbit propagation (satellite.js) only when
 * it is first opened.
 */
export function SatellitesView(props: SatellitesScreenProps) {
  return (
    <Suspense fallback={<p role="status">Loading Satellite Operations…</p>}>
      <SatellitesScreen {...props} />
    </Suspense>
  );
}
