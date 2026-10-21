import { SceneMode } from 'cesium';
import type { DrawnTotals } from '../records/recordLayerSet';
import type { MapEngine } from './engineProbe';
import type { FrameStats } from './frameStats';
import {
  CHANGE_STREAM_PATH,
  runScaleScenario,
  scaleProblems,
  settle,
  type ScaleStepResult,
} from './scaleScenario';

/** Frame timing with the given 95th percentile. */
const frames = (p95: number): FrameStats => ({
  frames: 90,
  seconds: 3,
  fps: 1000 / p95,
  p50: p95 / 2,
  p95,
  p99: p95,
  max: p95,
  slow: 0,
});

/** Totals with the given records and cells. */
const totals = (features: number, cells = 0, extra: Partial<DrawnTotals> = {}): DrawnTotals => ({
  layers: 40,
  loading: 0,
  features,
  cells,
  aggregated: 0,
  tiles: 12,
  instances: features,
  builds: 3,
  building: false,
  pointsShown: features,
  cellsShown: cells,
  ...extra,
});

/** A step result. */
const step = (label: string, extra: Partial<ScaleStepResult> = {}): ScaleStepResult => ({
  label,
  height: 1,
  settled: true,
  settleMs: 100,
  totals: totals(1000, 50),
  peakRequests: { active: 6, waiting: 20 },
  frames: frames(20),
  streams: { [CHANGE_STREAM_PATH]: 1 },
  ...extra,
});

/** A map engine whose layers report the given sequence of totals and requests, one per sample. */
function engine(samples: { totals: DrawnTotals; requests: { active: number; waiting: number } }[]) {
  let index = 0;
  const current = () => samples[Math.min(index, samples.length - 1)]!;
  const setView = vi.fn(() => {
    index = 0;
  });
  return {
    engine: {
      viewer: { camera: { setView }, scene: { mode: SceneMode.SCENE2D } },
      layers: {
        totals: () => current().totals,
        get requests() {
          const value = current().requests;
          index++;
          return value;
        },
      },
      toScreen: () => undefined,
    } as unknown as MapEngine,
    setView,
  };
}

describe('the scale scenario', () => {
  it('finds nothing wrong with one change stream, settled layers and frames in budget', () => {
    expect(
      scaleProblems({
        at: '',
        mode: '2D',
        layers: 40,
        steps: [step('World'), step('City', { totals: totals(200) })],
        maxChangeStreams: 1,
      }),
    ).toEqual([]);
  });

  it('counts the records the world’s cells hold when it holds the city to it', () => {
    // Clustered (037): the world draws few records one by one, and counts the rest in cells.
    expect(
      scaleProblems({
        at: '',
        mode: '2D',
        layers: 190,
        steps: [
          step('World', { totals: totals(120, 400, { aggregated: 37_000 }) }),
          step('City', { totals: totals(1_286) }),
        ],
        maxChangeStreams: 1,
      }),
    ).toEqual([]);
  });

  it('reports extra change streams, unsettled layers, slow frames and a city fuller than the world', () => {
    expect(
      scaleProblems({
        at: '',
        mode: '3D',
        layers: 40,
        steps: [
          step('World', { settled: false }),
          step('City', { totals: totals(5000), frames: frames(50) }),
        ],
        maxChangeStreams: 3,
      }),
    ).toEqual([
      '3 change-stream connections were open at once.',
      'World: the layers did not settle.',
      'City: p95 frame 50.0 ms is over the 33.3 ms budget.',
      "City drew 5000 records, more than World's 1000.",
    ]);
  });

  it('settles once nothing loads for five samples, keeping the peak of requests', async () => {
    const busy = { totals: totals(0, 0, { loading: 2 }), requests: { active: 6, waiting: 30 } };
    const quiet = { totals: totals(900), requests: { active: 0, waiting: 0 } };
    const { engine: map } = engine([busy, busy, quiet]);
    let clock = 0;
    const result = await settle(
      map,
      10_000,
      async (ms) => {
        clock += ms;
      },
      () => clock,
    );
    expect(result).toEqual({ settled: true, ms: 1200, peak: { active: 6, waiting: 30 } });
  });

  it('gives up settling at the timeout', async () => {
    const busy = { totals: totals(0, 0, { building: true }), requests: { active: 1, waiting: 0 } };
    const { engine: map } = engine([busy]);
    let clock = 0;
    const result = await settle(
      map,
      1_000,
      async (ms) => {
        clock += ms;
      },
      () => clock,
    );
    expect(result.settled).toBe(false);
    expect(result.ms).toBe(1000);
  });

  it('moves through each zoom, recording what is drawn, the frames, the heap and the streams', async () => {
    const quiet = { totals: totals(700, 40), requests: { active: 0, waiting: 0 } };
    const { engine: map, setView } = engine([quiet]);
    let clock = 0;
    const report = await runScaleScenario(map, [], {
      steps: [
        { label: 'World', longitude: 0, latitude: 0, height: 20_000_000 },
        { label: 'City', longitude: -95, latitude: 30, height: 60_000 },
      ],
      measure: async () => frames(16),
      wait: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      streams: () => ({ [CHANGE_STREAM_PATH]: 1, '/v1/alerts/stream': 1 }),
      heap: () => 123_000_000,
    });
    expect(setView).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({
      mode: '2D',
      layers: 0,
      maxChangeStreams: 1,
      problems: [],
      steps: [
        { label: 'World', settled: true, heapBytes: 123_000_000, totals: { features: 700 } },
        { label: 'City', settled: true, frames: { p95: 16 } },
      ],
    });
    expect(report.steps[0]!.streams).toEqual({
      [CHANGE_STREAM_PATH]: 1,
      '/v1/alerts/stream': 1,
    });
    expect(report.toggle).toBeUndefined();
  });
});
