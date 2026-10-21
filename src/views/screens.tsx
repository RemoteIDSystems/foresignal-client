import { Image, Map, RadioTower, Workflow } from 'lucide-react';
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

/** Imagery and change detection. */
export function ImageryView() {
  return (
    <PlaceholderView
      icon={Image}
      title="Imagery"
      description="Recent imagery, product frames and before/after change detection."
      builtIn="028"
    />
  );
}

/** RF and sensors. */
export function RfSensorsView() {
  return (
    <PlaceholderView
      icon={RadioTower}
      title="RF / Sensors"
      description="RF and spectrum layers, the sensor catalog and ground-station passes."
      builtIn="032"
    />
  );
}

/** Operations console. */
export function OperationsView() {
  return (
    <PlaceholderView
      icon={Workflow}
      title="Operations"
      description="Tasks, assets and workflows: queues, source health, channels and rules."
      builtIn="033"
    />
  );
}
