import { SceneMode } from 'cesium';
import { useEffect, useState } from 'react';
import type { DrawnTotals } from '../records/recordLayerSet';
import { openStreams } from '../../api/stream/sse';
import { engineProbe, type MapEngine } from './engineProbe';
import { heapBytes, runScaleScenario, SCALE_STEPS, type ScaleReport } from './scaleScenario';
import {
  MEASURE_MS,
  measureFrames,
  measureToggle,
  worldView,
  type StressResult,
} from './stressMode';
import styles from './stressHarness.module.css';

/** How often the live totals are read, in ms. */
const TOTALS_MS = 500;

/** Props for {@link StressHarness}. */
export interface StressHarnessProps {
  /** Every kind layer in the catalog. */
  kinds: readonly string[];
  /** The record layers drawn now. */
  drawn: readonly string[];
  /** Turns every kind on, drawn whether or not it has records. */
  onAll: () => void;
  /** Goes back to the default kinds. */
  onRestore: () => void;
}

/**
 * The development stress harness (`?stress` in a development build): turns on every kind in the
 * catalog at once, moves to the whole world, and measures frame timing while the map pans, what
 * is drawn (layers, records, cells, tiles, merged instances), and the cost of turning one layer
 * off and on. The live totals are shown as they change; a measurement is shown, and kept as JSON in
 * `data-testid="stress-result"` for the end-to-end check.
 */
export function StressHarness({ kinds, drawn, onAll, onRestore }: StressHarnessProps) {
  const [engine, setEngine] = useState<MapEngine>();
  const [totals, setTotals] = useState<DrawnTotals>();
  const [requests, setRequests] = useState({ waiting: 0, active: 0 });
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<StressResult>();
  const [streams, setStreams] = useState<Record<string, number>>({});
  const [heap, setHeap] = useState<number>();
  const [report, setReport] = useState<ScaleReport>();

  useEffect(() => engineProbe.subscribe(setEngine), []);
  useEffect(() => {
    if (!engine) return;
    const timer = setInterval(() => {
      setTotals(engine.layers.totals());
      setRequests(engine.layers.requests);
      setStreams(openStreams());
      setHeap(heapBytes());
    }, TOTALS_MS);
    return () => clearInterval(timer);
  }, [engine]);

  const measure = async () => {
    if (!engine || measuring) return;
    setMeasuring(true);
    try {
      const totalsNow = engine.layers.totals();
      const frames = await measureFrames(engine.viewer, MEASURE_MS);
      const toggle = await measureToggle(engine.layers, drawn);
      setResult({
        totals: totalsNow,
        frames,
        mode: engine.viewer.scene.mode === SceneMode.SCENE3D ? '3D' : '2D',
        toggle,
      });
    } finally {
      setMeasuring(false);
    }
  };

  const scale = async () => {
    if (!engine || measuring) return;
    setMeasuring(true);
    try {
      setReport(await runScaleScenario(engine, drawn));
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Stress harness" data-testid="stress-harness">
      <header>Stress harness · development</header>
      <div className={styles.actions}>
        <button type="button" onClick={onAll}>
          Turn on all {kinds.length} kinds
        </button>
        <button type="button" onClick={onRestore}>
          Restore
        </button>
        <button type="button" disabled={!engine} onClick={() => engine && worldView(engine.viewer)}>
          World view
        </button>
        <button type="button" disabled={!engine || measuring} onClick={() => void measure()}>
          {measuring ? 'Measuring…' : `Measure ${MEASURE_MS / 1000} s`}
        </button>
        <button type="button" disabled={!engine || measuring} onClick={() => void scale()}>
          {measuring ? 'Measuring…' : `Scale scenario (${SCALE_STEPS.length} zooms)`}
        </button>
      </div>
      {totals && (
        <dl className={styles.totals} data-testid="stress-totals">
          <dt>Layers</dt>
          <dd>
            {totals.layers}
            {totals.loading > 0 ? ` (${totals.loading} loading)` : ''}
          </dd>
          <dt>Records</dt>
          <dd>{totals.features.toLocaleString('en-US')}</dd>
          <dt>Cells</dt>
          <dd>{totals.cells.toLocaleString('en-US')}</dd>
          <dt>Tiles</dt>
          <dd>{totals.tiles}</dd>
          <dt>Merged</dt>
          <dd>
            {totals.instances.toLocaleString('en-US')} in {totals.builds} builds
            {totals.building ? ' …' : ''}
          </dd>
          <dt>Requests</dt>
          <dd>
            {requests.active} active, {requests.waiting} waiting
          </dd>
          <dt>Streams</dt>
          <dd data-testid="stress-streams">
            {Object.entries(streams)
              .map(([path, count]) => `${path.replace('/v1/', '')} ${count}`)
              .join(', ') || 'none'}
          </dd>
          {heap !== undefined && (
            <>
              <dt>Heap</dt>
              <dd>{(heap / 1_048_576).toFixed(0)} MB</dd>
            </>
          )}
        </dl>
      )}
      {result && (
        <>
          <p className={styles.result}>
            {result.frames.fps.toFixed(1)} fps · p50 {result.frames.p50.toFixed(1)} ms · p95{' '}
            {result.frames.p95.toFixed(1)} ms · p99 {result.frames.p99.toFixed(1)} ms ·{' '}
            {result.frames.slow} slow of {result.frames.frames}
            {result.toggle &&
              ` · toggle ${result.toggle.layer}: off ${result.toggle.off.ms.toFixed(1)} ms, on ${result.toggle.on.ms.toFixed(1)} ms, redrawn in ${result.toggle.redrawnMs.toFixed(0)} ms`}
          </p>
          <pre hidden data-testid="stress-result">
            {JSON.stringify(result)}
          </pre>
        </>
      )}
      {report && (
        <>
          <table className={styles.report} data-testid="scale-table">
            <thead>
              <tr>
                <th>Zoom</th>
                <th>Records</th>
                <th>Cells</th>
                <th>Tiles</th>
                <th>Peak req.</th>
                <th>p95 ms</th>
              </tr>
            </thead>
            <tbody>
              {report.steps.map((step) => (
                <tr key={step.label}>
                  <td>
                    {step.label}
                    {step.settled ? '' : ' (unsettled)'}
                  </td>
                  <td>{step.totals.features.toLocaleString('en-US')}</td>
                  <td>{step.totals.cells.toLocaleString('en-US')}</td>
                  <td>{step.totals.tiles}</td>
                  <td>{step.peakRequests.active}</td>
                  <td>{step.frames.p95.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.result}>
            {report.maxChangeStreams} change stream{report.maxChangeStreams === 1 ? '' : 's'} ·{' '}
            {report.problems.length === 0 ? 'no problems' : report.problems.join(' ')}
          </p>
          <pre hidden data-testid="scale-report">
            {JSON.stringify(report)}
          </pre>
        </>
      )}
    </section>
  );
}
