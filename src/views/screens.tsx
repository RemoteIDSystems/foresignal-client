import { Map } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

/** Full-screen map. */
export function MapView() {
  return (
    <PlaceholderView
      icon={Map}
      title="Map"
      description="The full 2D map and 3D globe with every layer."
      builtIn="005–010"
    />
  );
}
