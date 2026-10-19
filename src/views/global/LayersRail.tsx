import { useState } from 'react';
import {
  Building2,
  Camera,
  Cloud,
  Earth,
  Network,
  Orbit,
  Plane,
  Plus,
  Ship,
  Siren,
  Swords,
  TriangleAlert,
  AudioWaveform,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { PLACEHOLDER_LAYERS, type LayerIcon } from './placeholderData';
import styles from './GlobalDashboard.module.css';

/** Icon and accent color for each layer category, as drawn in the mockup's rail. */
const LAYER_ICONS: Record<LayerIcon, { icon: LucideIcon; color: string }> = {
  globe: { icon: Earth, color: '#9fb4c8' },
  events: { icon: Siren, color: '#ff5a5f' },
  aircraft: { icon: Plane, color: '#9fb4c8' },
  maritime: { icon: Ship, color: '#9fb4c8' },
  orbits: { icon: Orbit, color: '#9fb4c8' },
  weather: { icon: Cloud, color: '#9fb4c8' },
  imagery: { icon: Camera, color: '#9fb4c8' },
  rf: { icon: AudioWaveform, color: '#9fb4c8' },
  infrastructure: { icon: Building2, color: '#9fb4c8' },
  cyber: { icon: Network, color: '#9fb4c8' },
  energy: { icon: Zap, color: '#9fb4c8' },
  hazards: { icon: TriangleAlert, color: '#9fb4c8' },
  conflict: { icon: Swords, color: '#9fb4c8' },
};

type RailTab = 'layers' | 'entities' | 'filters';

/**
 * The left LAYERS / ENTITIES / FILTERS rail. Skeleton: the layer list and its toggles are local
 * placeholder state; prompt 007 replaces it with the backend's tile layers.
 */
export function LayersRail() {
  const [tab, setTab] = useState<RailTab>('layers');
  const [enabled, setEnabled] = useState(
    () => new Set(PLACEHOLDER_LAYERS.filter((l) => l.enabled).map((l) => l.id)),
  );
  const toggle = (id: string) =>
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className={styles.rail} aria-label="Layers">
      <Tabs
        label="Rail sections"
        variant="boxed"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'layers', label: 'Layers' },
          { key: 'entities', label: 'Entities' },
          { key: 'filters', label: 'Filters' },
        ]}
      />
      {tab === 'layers' ? (
        <>
          <ul className={styles.layerList}>
            {PLACEHOLDER_LAYERS.map((layer) => {
              const { icon: Icon, color } = LAYER_ICONS[layer.icon];
              return (
                <li key={layer.id}>
                  <label className={styles.layerRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={enabled.has(layer.id)}
                      onChange={() => toggle(layer.id)}
                    />
                    <Icon size={16} strokeWidth={1.75} color={color} aria-hidden="true" />
                    <span className={styles.layerName}>{layer.name}</span>
                    {layer.count !== undefined && (
                      <Badge kind="count">{layer.count.toLocaleString('en-US')}</Badge>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className={styles.railFooter}>
            <Button icon={<Plus size={14} />}>Add Layer</Button>
          </div>
        </>
      ) : (
        <p className={styles.empty}>
          {tab === 'entities'
            ? 'Entity list arrives with live data.'
            : 'Filters arrive with layer data.'}
        </p>
      )}
    </section>
  );
}
